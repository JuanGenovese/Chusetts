import { centsToPesos } from "@/shared/domain/money";
import { formatTimestamp } from "@/shared/domain/datetime";
import type { ReportMovement } from "./types";

/** Legacy `get_movimientos_periodo` column names (the downloaded file keeps them). */
const HEADER = [
  "id", "ticket_id", "fecha", "tipo", "categoria", "descripcion", "producto_nombre", "cantidad", "importe", "medio_pago",
  "proveedor", "created_by", "created_at", "anulada", "motivo_anulacion",
] as const;

function escapeCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** Legacy `df.to_csv(index=False)`: header + one line per movement, amounts in pesos, voided as 1/0. */
export function movementsToCsv(rows: ReportMovement[]): string {
  const lines = rows.map((m) =>
    [
      m.number, m.ticketId ?? "", m.businessDate, m.kind, m.category ?? "", m.description, m.productName ?? "", m.quantity,
      centsToPesos(m.amount), m.paymentMethod ?? "", m.supplier, m.createdByUsername, formatTimestamp(m.createdAt),
      m.voided ? 1 : 0, m.voidReason ?? "",
    ]
      .map((cell) => escapeCell(String(cell)))
      .join(","),
  );
  return [HEADER.join(","), ...lines].join("\n");
}

/** `movimientos_<desde>_<hasta>.csv` */
export const movementsCsvFileName = (from: string, to: string): string => `movimientos_${from}_${to}.csv`;
