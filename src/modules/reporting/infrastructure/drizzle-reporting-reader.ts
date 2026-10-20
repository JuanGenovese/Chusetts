import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { DbExecutor } from "@/shared/infrastructure/db/client";
import {
  cashSessions,
  movements,
  productCategories,
  products,
  saleOrderLines,
  saleOrders,
  stockLevels,
  users,
} from "@/shared/infrastructure/db/schema";
import type { ReportMovement, StockReportProduct, TicketLine } from "../domain";
import type { ReportingReader, ReportingRepositories } from "../application/ports";

const movementColumns = {
  id: movements.id,
  number: movements.number,
  businessDate: movements.businessDate,
  kind: movements.kind,
  category: movements.category,
  description: movements.description,
  productName: movements.productName,
  quantity: movements.quantity,
  unitPrice: movements.unitPrice,
  amount: movements.amount,
  paymentMethod: movements.paymentMethodName,
  supplier: movements.supplierName,
  notes: movements.notes,
  createdByUsername: users.username,
  createdAt: movements.createdAt,
  voided: movements.voided,
  voidReason: movements.voidReason,
  ticketId: movements.ticketId,
} as const;

/**
 * CQRS-lite read side: queries join ledger, catalog, inventory and cash tables directly (it never writes), so the
 * screens do not depend on the write-side repositories.
 */
class DrizzleReportingReader implements ReportingReader {
  constructor(private readonly db: DbExecutor) {}

  private movementQuery() {
    return this.db.select(movementColumns).from(movements).innerJoin(users, eq(users.id, movements.createdBy));
  }

  async listActiveMovements({ from, to }: { from: string; to?: string }): Promise<ReportMovement[]> {
    // Legacy: `fecha >= ? [AND fecha <= ?]` over non-voided rows, ORDER BY fecha DESC, id DESC.
    return this.movementQuery()
      .where(
        and(
          eq(movements.voided, false),
          gte(movements.businessDate, from),
          to ? lte(movements.businessDate, to) : undefined,
        ),
      )
      .orderBy(desc(movements.businessDate), desc(movements.number));
  }

  async listMovements({ from, to, includeVoided }: { from: string; to: string; includeVoided: boolean }): Promise<ReportMovement[]> {
    return this.movementQuery()
      .where(
        and(
          gte(movements.businessDate, from),
          lte(movements.businessDate, to),
          includeVoided ? undefined : eq(movements.voided, false),
        ),
      )
      .orderBy(desc(movements.businessDate), desc(movements.number));
  }

  async findMovementByNumber(number: number): Promise<ReportMovement | null> {
    const [row] = await this.movementQuery().where(eq(movements.number, number)).limit(1);
    return row ?? null;
  }

  async listActiveProductsWithStock(): Promise<StockReportProduct[]> {
    return this.db
      .select({
        number: products.number,
        name: products.name,
        categoryName: productCategories.name,
        stock: sql<number>`coalesce(${stockLevels.quantity}, 0)`.mapWith(Number),
        minStock: products.minStock,
        salePrice: products.salePrice,
        unitCost: products.unitCost,
      })
      .from(products)
      .leftJoin(productCategories, eq(productCategories.id, products.categoryId))
      .leftJoin(stockLevels, eq(stockLevels.productId, products.id))
      .where(eq(products.active, true))
      .orderBy(asc(products.number));
  }

  async listUserTickets(userId: string, businessDate: string) {
    // Legacy `get_user_orders`: items = quantities of the lines whose movement is still active.
    return this.db
      .select({
        ticketId: saleOrders.ticketId,
        createdAt: saleOrders.createdAt,
        total: saleOrders.total,
        items: sql<number>`coalesce(sum(case when ${movements.voided} = false then ${saleOrderLines.quantity} else 0 end), 0)`.mapWith(Number),
      })
      .from(saleOrders)
      .leftJoin(saleOrderLines, eq(saleOrderLines.orderId, saleOrders.id))
      .leftJoin(movements, eq(movements.id, saleOrderLines.movementId))
      .where(
        and(eq(saleOrders.status, "CONFIRMED"), eq(saleOrders.createdBy, userId), eq(saleOrders.businessDate, businessDate)),
      )
      .groupBy(saleOrders.id)
      .orderBy(desc(saleOrders.createdAt));
  }

  async listTicketLines(ticketId: string, userId: string): Promise<TicketLine[]> {
    return this.db
      .select({
        productName: saleOrderLines.productName,
        quantity: saleOrderLines.quantity,
        unitPrice: saleOrderLines.unitPrice,
        amount: saleOrderLines.subtotal,
      })
      .from(saleOrderLines)
      .innerJoin(saleOrders, eq(saleOrders.id, saleOrderLines.orderId))
      .innerJoin(movements, eq(movements.id, saleOrderLines.movementId))
      .where(
        and(
          eq(saleOrders.ticketId, ticketId),
          eq(saleOrders.createdBy, userId),
          eq(saleOrders.status, "CONFIRMED"),
          eq(movements.voided, false),
        ),
      )
      .orderBy(asc(saleOrderLines.sequence), asc(saleOrderLines.id));
  }

  async hasAnyOpenCashSession(): Promise<boolean> {
    const rows = await this.db.select({ id: cashSessions.id }).from(cashSessions).where(eq(cashSessions.status, "OPEN")).limit(1);
    return rows.length > 0;
  }
}

export function createReportingRepositories(db: DbExecutor): ReportingRepositories {
  return { reader: new DrizzleReportingReader(db) };
}
