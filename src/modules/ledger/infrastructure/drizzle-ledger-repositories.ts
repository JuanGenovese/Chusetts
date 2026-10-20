import { and, asc, eq, sql } from "drizzle-orm";
import type { DbExecutor } from "@/shared/infrastructure/db/client";
import { movements, saleOrderLines, saleOrders } from "@/shared/infrastructure/db/schema";
import type { LedgerMovement, SaleOrder, SaleOrderLine } from "../domain";
import type { LedgerMovementRepository, LedgerPersistence, SaleOrderRepository } from "../application/ports";

type MovementRow = typeof movements.$inferSelect;

function toMovement(row: MovementRow): LedgerMovement {
  return {
    id: row.id,
    number: row.number,
    businessDate: row.businessDate,
    kind: row.kind,
    category: row.category,
    categoryId: row.categoryId,
    description: row.description,
    productId: row.productId,
    productName: row.productName,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    amount: row.amount,
    paymentMethodId: row.paymentMethodId,
    paymentMethodName: row.paymentMethodName,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    notes: row.notes,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    voided: row.voided,
    voidReason: row.voidReason,
    voidedBy: row.voidedBy,
    voidedAt: row.voidedAt,
    ticketId: row.ticketId,
    cashSessionId: row.cashSessionId,
    saleOrderId: row.saleOrderId,
  };
}

class DrizzleLedgerMovementRepository implements LedgerMovementRepository {
  constructor(private readonly db: DbExecutor) {}

  async insert(m: LedgerMovement) {
    await this.db.insert(movements).values({
      id: m.id,
      businessDate: m.businessDate,
      kind: m.kind,
      category: m.category,
      categoryId: m.categoryId,
      description: m.description,
      productId: m.productId,
      productName: m.productName,
      quantity: m.quantity,
      unitPrice: m.unitPrice,
      amount: m.amount,
      paymentMethodId: m.paymentMethodId,
      paymentMethodName: m.paymentMethodName,
      supplierId: m.supplierId,
      supplierName: m.supplierName,
      notes: m.notes,
      createdBy: m.createdBy,
      createdAt: m.createdAt,
      voided: m.voided,
      voidReason: m.voidReason,
      voidedBy: m.voidedBy,
      voidedAt: m.voidedAt,
      ticketId: m.ticketId,
      cashSessionId: m.cashSessionId,
      saleOrderId: m.saleOrderId,
    });
  }

  async findById(id: string) {
    const [row] = await this.db.select().from(movements).where(eq(movements.id, id)).limit(1);
    return row ? toMovement(row) : null;
  }

  async cashSessionIdsByTicket(ticketId: string) {
    const rows = await this.db
      .selectDistinct({ sessionId: movements.cashSessionId })
      .from(movements)
      .where(eq(movements.ticketId, ticketId));
    return rows.flatMap((r) => (r.sessionId ? [r.sessionId] : []));
  }

  async listActiveSalesByTicket(ticketId: string, createdBy?: string) {
    const rows = await this.db
      .select()
      .from(movements)
      .where(
        and(
          eq(movements.ticketId, ticketId),
          eq(movements.kind, "Venta"),
          eq(movements.voided, false),
          createdBy ? eq(movements.createdBy, createdBy) : undefined,
        ),
      )
      .orderBy(asc(movements.number));
    return rows.map(toMovement);
  }

  async activeSalesSummary(ticketId: string) {
    const [row] = await this.db
      .select({
        activeCount: sql<number>`count(*)`.mapWith(Number),
        activeTotal: sql<number>`coalesce(sum(${movements.amount}), 0)`.mapWith(Number),
      })
      .from(movements)
      .where(and(eq(movements.ticketId, ticketId), eq(movements.kind, "Venta"), eq(movements.voided, false)));
    return { activeCount: row?.activeCount ?? 0, activeTotal: row?.activeTotal ?? 0 };
  }

  async markVoided(id: string, data: { reason: string; by: string; at: Date }) {
    await this.db
      .update(movements)
      .set({ voided: true, voidReason: data.reason, voidedBy: data.by, voidedAt: data.at })
      .where(eq(movements.id, id));
  }
}

class DrizzleSaleOrderRepository implements SaleOrderRepository {
  constructor(private readonly db: DbExecutor) {}

  async insert(o: SaleOrder) {
    await this.db.insert(saleOrders).values({
      id: o.id,
      ticketId: o.ticketId,
      businessDate: o.businessDate,
      cashSessionId: o.cashSessionId,
      status: o.status,
      paymentMethodId: o.paymentMethodId,
      total: o.total,
      notes: o.notes,
      createdBy: o.createdBy,
      createdAt: o.createdAt,
      voidedAt: o.voidedAt,
      voidedBy: o.voidedBy,
      voidReason: o.voidReason,
    });
  }

  async insertLine(l: SaleOrderLine) {
    await this.db.insert(saleOrderLines).values({
      id: l.id,
      orderId: l.orderId,
      sequence: l.sequence,
      productId: l.productId,
      productName: l.productName,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      subtotal: l.subtotal,
      movementId: l.movementId,
    });
  }

  async applyState(
    ticketId: string,
    state: { status: "CONFIRMED" | "VOIDED"; total: number },
    voided: { at: Date; by: string; reason: string },
  ) {
    await this.db
      .update(saleOrders)
      .set(
        state.status === "VOIDED"
          ? { status: "VOIDED", total: 0, voidedAt: voided.at, voidedBy: voided.by, voidReason: voided.reason }
          : { total: state.total },
      )
      .where(eq(saleOrders.ticketId, ticketId));
  }
}

/** Persistence adapters bound to one executor (a transaction inside a unit of work). */
export function createLedgerPersistence(db: DbExecutor): LedgerPersistence {
  return {
    movements: new DrizzleLedgerMovementRepository(db),
    orders: new DrizzleSaleOrderRepository(db),
  };
}
