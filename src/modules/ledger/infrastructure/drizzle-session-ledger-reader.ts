import { sql } from "drizzle-orm";
import type { DbExecutor } from "@/shared/infrastructure/db/client";
import { CASH_PAYMENT_CODE } from "../domain";

/** Non-cash totals of a session's active ledger rows, keyed like the cash module's payment methods. */
export interface SessionPaymentTotal {
  paymentMethod: string;
  kind: "sale" | "expense" | "purchase";
  total: number;
}

export interface SessionSalesTotals {
  sales: number;
  cashSales: number;
  electronicSales: number;
  tickets: number;
}

/**
 * Legacy `calculate_expected` buckets by payment-method NAME: Transferencia / Tarjeta / Mercado Pago, anything else
 * (Nave, Otro, ...) falls into "Otro". The seeded methods are matched by code (the legacy "Mercado Pago" no longer exists).
 */
const CASH_KEY_BY_CODE: Record<string, string> = { TRANSFERENCIA: "transfer", TARJETA: "card", MERCADO_PAGO: "mercado_pago" };
const KIND_KEY = { Venta: "sale", Gasto: "expense", Compra: "purchase" } as const;

/**
 * Implements the cash module's `SessionLedgerReader` port (structurally; the composition root plugs it into the cash
 * repositories) with real queries over the ledger. Replaces the empty Phase 1 stub.
 */
export function createSessionLedgerReader(db: DbExecutor) {
  return {
    async nonCashTotals(sessionId: string): Promise<SessionPaymentTotal[]> {
      const rows = await db.execute<{ code: string | null; kind: keyof typeof KIND_KEY; total: string }>(sql`
        select pm.code as code, m.kind as kind, coalesce(sum(m.amount), 0) as total
        from movements m
        left join payment_methods pm on pm.id = m.payment_method_id
        where m.cash_session_id = ${sessionId}
          and m.voided = false
          and m.kind in ('Venta', 'Gasto', 'Compra')
          and coalesce(pm.code, '') <> ${CASH_PAYMENT_CODE}
        group by pm.code, m.kind
      `);
      return rows.map((row) => ({
        paymentMethod: CASH_KEY_BY_CODE[row.code ?? ""] ?? "other",
        kind: KIND_KEY[row.kind],
        total: Number(row.total),
      }));
    },

    async salesSummary(sessionId: string): Promise<SessionSalesTotals> {
      const [row] = await db.execute<{ sales: string; cash_sales: string; electronic_sales: string; tickets: string }>(sql`
        select
          coalesce(sum(m.amount) filter (where m.kind = 'Venta'), 0) as sales,
          coalesce(sum(m.amount) filter (where m.kind = 'Venta' and pm.code = ${CASH_PAYMENT_CODE}), 0) as cash_sales,
          coalesce(sum(m.amount) filter (where m.kind = 'Venta' and pm.code <> ${CASH_PAYMENT_CODE}), 0) as electronic_sales,
          count(distinct m.ticket_id) filter (where m.kind = 'Venta') as tickets
        from movements m
        left join payment_methods pm on pm.id = m.payment_method_id
        where m.cash_session_id = ${sessionId} and m.voided = false
      `);
      return {
        sales: Number(row?.sales ?? 0),
        cashSales: Number(row?.cash_sales ?? 0),
        electronicSales: Number(row?.electronic_sales ?? 0),
        tickets: Number(row?.tickets ?? 0),
      };
    },
  };
}
