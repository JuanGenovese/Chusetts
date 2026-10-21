import type { Clock, IdGenerator } from "@/shared/application/runtime";
import type { LedgerMovement, MovementKind, SaleOrder, SaleOrderLine } from "../../domain";
import type {
  LedgerPaymentMethod,
  LedgerProduct,
  LedgerRepositories,
  LedgerUnitOfWork,
} from "../ports/repositories";

export interface FakeProduct extends LedgerProduct {
  stock: number;
  purchaseFactor: number;
  controlsStock: boolean;
}

interface FakeStockRow {
  movementId: string;
  productId: string;
  delta: number;
  type: string;
  reason: string;
  reverted: boolean;
}

interface FakeCashRow {
  sessionId: string;
  kind: "CASH_SALE" | "CASH_OUTFLOW" | "SALE_REFUND" | "OUTFLOW_REVERSAL";
  sign: 1 | -1;
  amount: number;
  ref: string;
  description: string;
  reason?: string;
}

const CLOSED_VOID = "No se puede anular: la caja de este ticket ya está cerrada. Registre un ajuste manual en la caja abierta.";

/**
 * In-memory world for ledger unit tests: the ledger's own tables plus tiny fakes of the stock / cash / catalog
 * collaborators. The UoW snapshots EVERYTHING and restores it when the work throws (== one DB transaction).
 */
export class InMemoryLedgerWorld {
  movements: LedgerMovement[] = [];
  orders: SaleOrder[] = [];
  lines: SaleOrderLine[] = [];
  products = new Map<string, FakeProduct>();
  suppliers = new Map<string, { id: string; name: string }>();
  paymentMethods: LedgerPaymentMethod[] = [
    { id: "pm-cash", name: "Efectivo", code: "EFECTIVO" },
    { id: "pm-transfer", name: "Transferencia", code: "TRANSFERENCIA" },
    { id: "pm-mercado-pago", name: "Mercado Pago", code: "MERCADO_PAGO" },
  ];
  movementCategories: { id: string; name: string; kind: MovementKind }[] = [
    { id: "mc-gasto", name: "Servicios", kind: "Gasto" },
    { id: "mc-compra", name: "Compra bebida", kind: "Compra" },
  ];
  openSessions = new Map<string, string>(); // userId -> session id
  closedSessions = new Set<string>();
  stockRows: FakeStockRow[] = [];
  cashRows: FakeCashRow[] = [];
  private movementSeq = 0;

  addProduct(input: Partial<FakeProduct> & { name: string }): string {
    const id = input.id ?? `p-${this.products.size + 1}`;
    this.products.set(id, {
      id,
      name: input.name,
      categoryName: input.categoryName === undefined ? "Bebidas" : input.categoryName,
      salePrice: input.salePrice ?? 100_000,
      active: input.active ?? true,
      stock: input.stock ?? 0,
      purchaseFactor: input.purchaseFactor ?? 1,
      controlsStock: input.controlsStock ?? true,
    });
    return id;
  }

  openSession(userId: string, sessionId = `cs-${userId}`, openingCash = 1_000_000): string {
    this.openSessions.set(userId, sessionId);
    this.cashRows.push({ sessionId, kind: "CASH_SALE", sign: 1, amount: openingCash, ref: `OPENING:${sessionId}`, description: "Apertura" });
    return sessionId;
  }

  closeSession(userId: string): void {
    const id = this.openSessions.get(userId);
    if (id) {
      this.closedSessions.add(id);
      this.openSessions.delete(userId);
    }
  }

  cashBalance(sessionId: string): number {
    return this.cashRows.filter((r) => r.sessionId === sessionId).reduce((a, r) => a + r.sign * r.amount, 0);
  }

  stock(productId: string): number {
    return this.products.get(productId)!.stock;
  }

  snapshot() {
    return structuredClone({
      movements: this.movements,
      orders: this.orders,
      lines: this.lines,
      products: this.products,
      openSessions: this.openSessions,
      closedSessions: this.closedSessions,
      stockRows: this.stockRows,
      cashRows: this.cashRows,
      movementSeq: this.movementSeq,
    });
  }

  restore(s: ReturnType<InMemoryLedgerWorld["snapshot"]>) {
    this.movements = s.movements;
    this.orders = s.orders;
    this.lines = s.lines;
    this.products = s.products;
    this.openSessions = s.openSessions;
    this.closedSessions = s.closedSessions;
    this.stockRows = s.stockRows;
    this.cashRows = s.cashRows;
    this.movementSeq = s.movementSeq;
  }

  repositories(): LedgerRepositories {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- fakes close over the world
    const w = this;
    const requireMovement = (id: string) => {
      if (!w.movements.some((m) => m.id === id)) throw new Error(`FK violation: ledger movement ${id} does not exist`);
    };
    return {
      movements: {
        async insert(movement) {
          w.movementSeq += 1;
          w.movements.push({ ...structuredClone(movement), number: w.movementSeq });
        },
        async findById(id) {
          return structuredClone(w.movements.find((m) => m.id === id) ?? null);
        },
        async cashSessionIdsByTicket(ticketId) {
          return [...new Set(w.movements.filter((m) => m.ticketId === ticketId && m.cashSessionId).map((m) => m.cashSessionId!))];
        },
        async listActiveSalesByTicket(ticketId, createdBy) {
          return structuredClone(
            w.movements.filter(
              (m) => m.ticketId === ticketId && m.kind === "Venta" && !m.voided && (!createdBy || m.createdBy === createdBy),
            ),
          );
        },
        async activeSalesSummary(ticketId) {
          const active = w.movements.filter((m) => m.ticketId === ticketId && m.kind === "Venta" && !m.voided);
          return { activeCount: active.length, activeTotal: active.reduce((a, m) => a + m.amount, 0) };
        },
        async markVoided(id, data) {
          const m = w.movements.find((x) => x.id === id)!;
          Object.assign(m, { voided: true, voidReason: data.reason, voidedBy: data.by, voidedAt: data.at });
        },
      },
      orders: {
        async insert(order) {
          w.orders.push(structuredClone(order));
        },
        async insertLine(line) {
          if (line.movementId) requireMovement(line.movementId);
          w.lines.push(structuredClone(line));
        },
        async applyState(ticketId, state, voided) {
          const order = w.orders.find((o) => o.ticketId === ticketId);
          if (!order) return;
          order.total = state.total;
          if (state.status === "VOIDED") {
            Object.assign(order, { status: "VOIDED", voidedAt: voided.at, voidedBy: voided.by, voidReason: voided.reason });
          }
        },
      },
      stock: {
        async consumeSaleStock({ movementId, productId, quantity }) {
          requireMovement(movementId);
          if (!(quantity > 0)) throw new Error("La cantidad vendida debe ser mayor que cero.");
          const product = w.products.get(productId);
          if (!product || !product.active) throw new Error("El producto no existe o está inactivo.");
          if (!product.controlsStock) return;
          if (product.stock < quantity) {
            throw new Error(`Stock insuficiente. ${product.name}: disponible ${product.stock} unidad, requerido ${quantity}`);
          }
          product.stock -= quantity;
          w.stockRows.push({ movementId, productId, delta: -quantity, type: "CONSUMO_VENTA", reason: "Consumo por venta o receta", reverted: false });
        },
        async purchaseToStockQuantity(productId, purchaseQuantity) {
          if (!(purchaseQuantity > 0)) throw new Error("La cantidad comprada debe ser mayor que cero.");
          const product = w.products.get(productId);
          if (!product || !product.active) throw new Error("El producto no existe o está inactivo.");
          return purchaseQuantity * product.purchaseFactor;
        },
        async applyDirectStockDelta({ movementId, productId, quantityDelta, movementType, reason }) {
          requireMovement(movementId);
          const product = w.products.get(productId)!;
          if (product.stock + quantityDelta < 0) throw new Error("El movimiento dejaría el stock en negativo.");
          product.stock += quantityDelta;
          w.stockRows.push({ movementId, productId, delta: quantityDelta, type: movementType, reason, reverted: false });
        },
        async planStockAdjustment({ productId, countedStock, reason }) {
          const clean = reason.trim();
          if (!clean) throw new Error("El motivo del ajuste es obligatorio.");
          const product = w.products.get(productId);
          if (!product || !product.active) throw new Error("El producto no existe o está inactivo.");
          const delta = countedStock - product.stock;
          if (Math.abs(delta) <= 1e-12) throw new Error("El stock contado coincide con el stock del sistema.");
          return {
            productId,
            productName: product.name,
            categoryName: product.categoryName,
            previousStock: product.stock,
            newStock: countedStock,
            delta,
            reason: clean,
          };
        },
        async createStockAdjustment({ movementId, productId, countedStock, reason }) {
          requireMovement(movementId);
          const product = w.products.get(productId)!;
          const delta = countedStock - product.stock;
          product.stock = countedStock;
          w.stockRows.push({ movementId, productId, delta, type: "AJUSTE_FISICO", reason: reason.trim(), reverted: false });
        },
        async reverseMovementStock({ movementId }) {
          const rows = w.stockRows.filter((r) => r.movementId === movementId && !r.reverted);
          for (const row of rows) {
            w.products.get(row.productId)!.stock -= row.delta;
            row.reverted = true;
          }
          return rows.length;
        },
      },
      cash: {
        async findOpenSession(userId) {
          const id = w.openSessions.get(userId);
          return id ? { id } : null;
        },
        async assertSessionAllowsVoid(sessionId) {
          if (w.closedSessions.has(sessionId)) throw new Error(CLOSED_VOID);
        },
        async recordCashSale({ sessionId, saleMovementId, amount, description }) {
          if (w.closedSessions.has(sessionId)) throw new Error("La caja está cerrada: no se pueden registrar movimientos de efectivo.");
          w.cashRows.push({ sessionId, kind: "CASH_SALE", sign: 1, amount, ref: `MOVEMENT:${saleMovementId}`, description });
        },
        async recordCashExpense({ sessionId, expenseMovementId, amount, description }) {
          if (w.closedSessions.has(sessionId)) throw new Error("La caja está cerrada: no se pueden registrar movimientos de efectivo.");
          if (w.cashBalance(sessionId) - amount < 0) throw new Error("El movimiento dejaría la caja con efectivo negativo.");
          w.cashRows.push({ sessionId, kind: "CASH_OUTFLOW", sign: -1, amount, ref: `MOVEMENT:${expenseMovementId}`, description });
        },
        async recordCashReversal({ originalMovementId, sessionId, kind, paidInCash, amount, description, reason }) {
          if (!paidInCash || !sessionId) return;
          if (w.closedSessions.has(sessionId)) throw new Error(CLOSED_VOID);
          const sale = kind === "sale";
          if (sale && w.cashBalance(sessionId) - amount < 0) throw new Error("El movimiento dejaría la caja con efectivo negativo.");
          w.cashRows.push({
            sessionId,
            kind: sale ? "SALE_REFUND" : "OUTFLOW_REVERSAL",
            sign: sale ? -1 : 1,
            amount,
            ref: `REVERSAL:${originalMovementId}`,
            description: `Anulación: ${description}`,
            reason,
          });
        },
      },
      catalog: {
        async getProduct(id) {
          const p = w.products.get(id);
          return p ? { id: p.id, name: p.name, categoryName: p.categoryName, salePrice: p.salePrice, active: p.active } : null;
        },
        async resolveActivePaymentMethod(name) {
          const found = w.paymentMethods.find((m) => m.name.toLowerCase() === name.trim().toLowerCase());
          if (!found) throw new Error("El medio de pago no existe o está inactivo.");
          return { ...found };
        },
        async getPaymentMethod(id) {
          const found = w.paymentMethods.find((m) => m.id === id);
          return found ? { ...found } : null;
        },
        async getSupplier(id) {
          return w.suppliers.get(id) ?? null;
        },
        async findMovementCategory(name, kind) {
          const found = w.movementCategories.find((c) => c.kind === kind && c.name.toLowerCase() === name.trim().toLowerCase());
          return found ? { id: found.id, name: found.name } : null;
        },
      },
    };
  }

  unitOfWork(): LedgerUnitOfWork {
    return {
      run: async (work) => {
        const before = this.snapshot();
        try {
          return await work(this.repositories());
        } catch (error) {
          this.restore(before);
          throw error;
        }
      },
    };
  }
}

export class FixedClock implements Clock {
  constructor(
    private current = new Date("2026-08-30T15:00:00Z"),
    private date = "2026-08-30",
  ) {}
  now() {
    return new Date(this.current);
  }
  businessDate() {
    return this.date;
  }
}

export class SequentialIds implements IdGenerator {
  private n = 0;
  next() {
    this.n += 1;
    return `00000${this.n}ab-0000-4000-8000-000000000000`.slice(-36);
  }
}

export function makeLedgerTestDeps() {
  const world = new InMemoryLedgerWorld();
  return { world, deps: { uow: world.unitOfWork(), clock: new FixedClock(), ids: new SequentialIds() } };
}
