import { isCents, type Cents } from "@/shared/domain/money";
import {
  LedgerError,
  assertAdmin,
  buildTicketId,
  cashReversalKind,
  isCashPaymentMethod,
  isValidBusinessDate,
  lineAmount,
  nextOrderState,
  requireReason,
  type Actor,
  type LedgerMovement,
  type MovementKind,
  type SaleOrder,
  type SaleOrderLine,
} from "../domain";
import type { LedgerRuntime } from "./deps";
import type { LedgerPaymentMethod, LedgerRepositories, StockAdjustmentPlanView } from "./ports/repositories";

export interface SaleLineInput {
  productId: string;
  quantity: number;
}

export interface RegisterSaleTicketInput {
  actor: Actor;
  lines: SaleLineInput[];
  /** Payment method display name (case-insensitive), e.g. "Efectivo". */
  paymentMethod: string;
  notes?: string;
}

export interface RegisterSaleTicketResult {
  ticketId: string;
  orderId: string;
  total: Cents;
  movementIds: string[];
}

export interface AdminMovementInput {
  actor: Actor;
  kind: MovementKind;
  /** Operating date (YYYY-MM-DD) the movement belongs to; the form's "Fecha". */
  businessDate: string;
  /** Movement category (expense / purchase category name, product category for sales). */
  category: string | null;
  description: string;
  productId?: string | null;
  supplierId?: string | null;
  quantity: number;
  unitPrice: Cents;
  amount: Cents;
  paymentMethod: string;
  notes?: string;
}

export interface AdminMovementResult {
  movementId: string;
  /** Only for "Venta". */
  ticketId: string | null;
}

export interface RegisterExpenseInput {
  actor: Actor;
  businessDate: string;
  description: string;
  category: string;
  amount: Cents;
  paymentMethod: string;
}

export interface RegisterPurchaseInput {
  actor: Actor;
  businessDate: string;
  description: string;
  category: string;
  productId?: string | null;
  supplierId?: string | null;
  quantity: number;
  unitCost: Cents;
  paymentMethod: string;
}

export interface RegisterAdminSaleInput {
  actor: Actor;
  businessDate: string;
  description: string;
  productId?: string | null;
  quantity: number;
  unitPrice: Cents;
  paymentMethod: string;
}

export interface StockAdjustmentRecord extends StockAdjustmentPlanView {
  movementId: string;
}

/**
 * Transaction-scoped ledger operations (ports `repository/movements.py` + the ledger side of `inventory_service`).
 *
 * They run on the repositories they are given (ledger tables + stock/cash/catalog collaborators bound to the SAME
 * transaction) and never open one: a failure anywhere (stock, cash, ...) rolls the whole operation back.
 * Ledger rows are always inserted BEFORE the stock / cash rows that reference them.
 */
export function createLedgerService(repos: LedgerRepositories, runtime: LedgerRuntime) {
  function baseMovement(input: Partial<LedgerMovement> & Pick<LedgerMovement, "id" | "kind" | "description" | "createdBy" | "businessDate">): LedgerMovement {
    return {
      number: 0,
      category: null,
      categoryId: null,
      productId: null,
      productName: null,
      quantity: 0,
      unitPrice: 0,
      amount: 0,
      paymentMethodId: null,
      paymentMethodName: null,
      supplierId: null,
      supplierName: "",
      notes: "",
      createdAt: runtime.clock.now(),
      voided: false,
      voidReason: null,
      voidedBy: null,
      voidedAt: null,
      ticketId: null,
      cashSessionId: null,
      saleOrderId: null,
      ...input,
    };
  }

  async function paymentMethodOf(movement: LedgerMovement): Promise<LedgerPaymentMethod | null> {
    return movement.paymentMethodId ? repos.catalog.getPaymentMethod(movement.paymentMethodId) : null;
  }

  // ---- sale ticket (POS) --------------------------------------------------------------------------------------

  /** Legacy `crear_movimientos_venta` + `save_ticket`. */
  async function registerSaleTicket(input: RegisterSaleTicketInput): Promise<RegisterSaleTicketResult> {
    if (input.lines.length === 0) throw new LedgerError("El carrito está vacío.");
    const session = await repos.cash.findOpenSession(input.actor.id);
    if (!session) throw new LedgerError("Tu turno ya no está abierto. Abrí un turno antes de confirmar la venta.");
    const payment = await repos.catalog.resolveActivePaymentMethod(input.paymentMethod);

    const priced: { productId: string; productName: string; quantity: number; unitPrice: Cents; amount: Cents }[] = [];
    for (const line of input.lines) {
      if (!(Number(line.quantity) > 0)) throw new LedgerError("La cantidad vendida debe ser mayor que cero.");
      const product = await repos.catalog.getProduct(line.productId);
      if (!product || !product.active) throw new LedgerError("El producto no existe o está inactivo.");
      priced.push({
        productId: product.id,
        productName: product.name,
        quantity: line.quantity,
        unitPrice: product.salePrice,
        amount: lineAmount(line.quantity, product.salePrice),
      });
    }

    const now = runtime.clock.now();
    const businessDate = runtime.clock.businessDate();
    const ticketId = buildTicketId(businessDate, runtime.ids.next());
    const notes = input.notes ?? "";
    const total = priced.reduce((sum, line) => sum + line.amount, 0);
    const order: SaleOrder = {
      id: runtime.ids.next(),
      ticketId,
      businessDate,
      cashSessionId: session.id,
      status: "CONFIRMED",
      paymentMethodId: payment.id,
      total,
      notes,
      createdBy: input.actor.id,
      createdAt: now,
      voidedAt: null,
      voidedBy: null,
      voidReason: null,
    };
    await repos.orders.insert(order);

    const movementIds: string[] = [];
    for (const [index, line] of priced.entries()) {
      const movement = baseMovement({
        id: runtime.ids.next(),
        businessDate,
        kind: "Venta",
        category: "Venta mostrador",
        description: line.productName,
        productId: line.productId,
        productName: line.productName,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        amount: line.amount,
        paymentMethodId: payment.id,
        paymentMethodName: payment.name,
        notes,
        createdBy: input.actor.id,
        createdAt: now,
        ticketId,
        cashSessionId: session.id,
        saleOrderId: order.id,
      });
      await repos.movements.insert(movement);
      await repos.stock.consumeSaleStock({
        movementId: movement.id,
        productId: line.productId,
        quantity: line.quantity,
        actorId: input.actor.id,
      });
      const orderLine: SaleOrderLine = {
        id: runtime.ids.next(),
        orderId: order.id,
        sequence: (index + 1) * 10,
        productId: line.productId,
        productName: line.productName,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        subtotal: line.amount,
        movementId: movement.id,
      };
      await repos.orders.insertLine(orderLine);
      if (isCashPaymentMethod(payment.code)) {
        await repos.cash.recordCashSale({
          sessionId: session.id,
          saleMovementId: movement.id,
          actorId: input.actor.id,
          amount: line.amount,
          description: line.productName,
        });
      }
      movementIds.push(movement.id);
    }
    return { ticketId, orderId: order.id, total, movementIds };
  }

  // ---- administrative movements (Cargar gasto / compra / venta / ajuste) -------------------------------------

  /** Legacy `crear_movimiento_admin` (+ the description check of `quick_entry._guardar_movimiento`). */
  async function createAdminMovement(input: AdminMovementInput): Promise<AdminMovementResult> {
    assertAdmin(input.actor);
    const description = input.description.trim();
    if (!description) throw new LedgerError("La descripción es obligatoria.");
    if (!isValidBusinessDate(input.businessDate)) throw new LedgerError("La fecha es inválida.");
    if (!isCents(input.amount) || !isCents(input.unitPrice)) throw new LedgerError("El importe es inválido.");
    if (input.amount < 0 || input.unitPrice < 0) throw new LedgerError("El importe no puede ser negativo.");
    if (!Number.isFinite(input.quantity)) throw new LedgerError("La cantidad es inválida.");
    if (input.kind !== "Ajuste Stock" && input.quantity < 0) throw new LedgerError("La cantidad no puede ser negativa.");

    const session = await repos.cash.findOpenSession(input.actor.id);
    if (input.kind === "Venta" && !session) {
      throw new LedgerError("Para registrar una venta administrativa primero tenés que abrir tu turno desde Mi turno.");
    }
    const payment = await repos.catalog.resolveActivePaymentMethod(input.paymentMethod);
    const paidInCash = isCashPaymentMethod(payment.code);
    if (paidInCash && (input.kind === "Gasto" || input.kind === "Compra") && !session) {
      throw new LedgerError("Para pagar en efectivo primero tenés que abrir tu turno desde Mi turno.");
    }

    const product = input.productId ? await repos.catalog.getProduct(input.productId) : null;
    if (input.productId && !product) throw new LedgerError("El producto no existe o está inactivo.");
    const supplier = input.supplierId ? await repos.catalog.getSupplier(input.supplierId) : null;
    if (input.supplierId && !supplier) throw new LedgerError("El proveedor no existe.");
    const category =
      input.category && (input.kind === "Gasto" || input.kind === "Compra")
        ? await repos.catalog.findMovementCategory(input.category, input.kind)
        : null;

    const now = runtime.clock.now();
    const notes = input.notes ?? "";
    let ticketId: string | null = null;
    let orderId: string | null = null;
    if (input.kind === "Venta") {
      ticketId = buildTicketId(runtime.clock.businessDate(), runtime.ids.next());
      orderId = runtime.ids.next();
      await repos.orders.insert({
        id: orderId,
        ticketId,
        businessDate: input.businessDate,
        cashSessionId: session!.id,
        status: "CONFIRMED",
        paymentMethodId: payment.id,
        total: input.amount,
        notes,
        createdBy: input.actor.id,
        createdAt: now,
        voidedAt: null,
        voidedBy: null,
        voidReason: null,
      });
    }

    const movement = baseMovement({
      id: runtime.ids.next(),
      businessDate: input.businessDate,
      kind: input.kind,
      category: input.category,
      categoryId: category?.id ?? null,
      description,
      productId: product?.id ?? null,
      productName: product?.name ?? null,
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      amount: input.amount,
      paymentMethodId: payment.id,
      paymentMethodName: payment.name,
      supplierId: supplier?.id ?? null,
      supplierName: supplier?.name ?? "",
      notes,
      createdBy: input.actor.id,
      createdAt: now,
      ticketId,
      cashSessionId: session?.id ?? null,
      saleOrderId: orderId,
    });
    await repos.movements.insert(movement);

    if (input.kind === "Venta" && orderId) {
      await repos.orders.insertLine({
        id: runtime.ids.next(),
        orderId,
        sequence: 10,
        productId: movement.productId,
        productName: movement.productName ?? description,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        subtotal: input.amount,
        movementId: movement.id,
      });
    }
    if (product && input.kind === "Venta") {
      await repos.stock.consumeSaleStock({ movementId: movement.id, productId: product.id, quantity: input.quantity, actorId: input.actor.id });
    } else if (product && input.kind === "Compra") {
      const stockQuantity = await repos.stock.purchaseToStockQuantity(product.id, input.quantity);
      await repos.stock.applyDirectStockDelta({
        movementId: movement.id,
        productId: product.id,
        quantityDelta: stockQuantity,
        actorId: input.actor.id,
        movementType: "INGRESO_COMPRA",
        reason: notes.trim() || "Ingreso por compra",
      });
    } else if (product && input.kind === "Ajuste Stock") {
      await repos.stock.applyDirectStockDelta({
        movementId: movement.id,
        productId: product.id,
        quantityDelta: input.quantity,
        actorId: input.actor.id,
        movementType: "AJUSTE_ADMIN",
        reason: notes.trim() || "Ajuste administrativo",
      });
    }

    if (paidInCash && session) {
      if (input.kind === "Venta") {
        await repos.cash.recordCashSale({
          sessionId: session.id,
          saleMovementId: movement.id,
          actorId: input.actor.id,
          amount: input.amount,
          description: description || movement.productName || "Venta administrativa",
        });
      } else if (input.kind === "Gasto" || input.kind === "Compra") {
        await repos.cash.recordCashExpense({
          sessionId: session.id,
          expenseMovementId: movement.id,
          actorId: input.actor.id,
          amount: input.amount,
          description: description || input.kind,
        });
      }
    }
    return { movementId: movement.id, ticketId };
  }

  /** "Cargar gasto": one unit, price = amount, no product. */
  const registerExpense = (input: RegisterExpenseInput): Promise<AdminMovementResult> =>
    createAdminMovement({
      actor: input.actor,
      kind: "Gasto",
      businessDate: input.businessDate,
      category: input.category,
      description: input.description,
      quantity: 1,
      unitPrice: input.amount,
      amount: input.amount,
      paymentMethod: input.paymentMethod,
    });

  /** "Cargar compra": amount = quantity x unit cost; stock intake through the product's purchase factor. */
  const registerPurchase = (input: RegisterPurchaseInput): Promise<AdminMovementResult> =>
    createAdminMovement({
      actor: input.actor,
      kind: "Compra",
      businessDate: input.businessDate,
      category: input.category,
      description: input.description,
      productId: input.productId ?? null,
      supplierId: input.supplierId ?? null,
      quantity: input.quantity,
      unitPrice: input.unitCost,
      amount: lineAmount(input.quantity, input.unitCost),
      paymentMethod: input.paymentMethod,
    });

  /** Administrative sale (quick entry "Venta"): free unit price, category = product category or "Venta". */
  async function registerAdminSale(input: RegisterAdminSaleInput): Promise<AdminMovementResult> {
    const product = input.productId ? await repos.catalog.getProduct(input.productId) : null;
    return createAdminMovement({
      actor: input.actor,
      kind: "Venta",
      businessDate: input.businessDate,
      category: product ? product.categoryName : "Venta",
      description: input.description,
      productId: input.productId ?? null,
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      amount: lineAmount(input.quantity, input.unitPrice),
      paymentMethod: input.paymentMethod,
    });
  }

  // ---- stock adjustments ---------------------------------------------------------------------------------------

  /**
   * Legacy `create_stock_adjustment`: the "Ajuste Stock" ledger row (quantity = signed delta) is inserted first, then
   * the stock audit row that references it. Used for initial stock too (no permission check: system use).
   */
  async function recordStockAdjustment(input: {
    actorId: string;
    productId: string;
    countedStock: number;
    reason: string;
  }): Promise<StockAdjustmentRecord> {
    const plan = await repos.stock.planStockAdjustment({
      productId: input.productId,
      countedStock: input.countedStock,
      reason: input.reason,
    });
    const movementId = runtime.ids.next();
    await repos.movements.insert(
      baseMovement({
        id: movementId,
        businessDate: runtime.clock.businessDate(),
        kind: "Ajuste Stock",
        category: plan.categoryName,
        description: `Ajuste físico: ${plan.productName}`,
        productId: plan.productId,
        productName: plan.productName,
        quantity: plan.delta,
        notes: plan.reason,
        createdBy: input.actorId,
      }),
    );
    await repos.stock.createStockAdjustment({
      movementId,
      productId: input.productId,
      countedStock: input.countedStock,
      actorId: input.actorId,
      reason: plan.reason,
    });
    return { movementId, ...plan };
  }

  async function adjustStock(input: { actor: Actor; productId: string; countedStock: number; reason: string }): Promise<StockAdjustmentRecord> {
    assertAdmin(input.actor);
    return recordStockAdjustment({
      actorId: input.actor.id,
      productId: input.productId,
      countedStock: input.countedStock,
      reason: input.reason,
    });
  }

  // ---- voids ----------------------------------------------------------------------------------------------------

  async function voidRow(row: LedgerMovement, actor: Actor, reason: string, at: Date): Promise<void> {
    await repos.movements.markVoided(row.id, { reason, by: actor.id, at });
    await repos.stock.reverseMovementStock({ movementId: row.id, actorId: actor.id });
    const kind = cashReversalKind(row.kind);
    if (kind === "other") return;
    const method = await paymentMethodOf(row);
    await repos.cash.recordCashReversal({
      originalMovementId: row.id,
      sessionId: row.cashSessionId,
      kind,
      paidInCash: isCashPaymentMethod(method?.code),
      amount: row.amount,
      description: row.description,
      actorId: actor.id,
      reason,
    });
  }

  async function syncOrderState(ticketId: string, actor: Actor, reason: string, at: Date): Promise<void> {
    const state = nextOrderState(await repos.movements.activeSalesSummary(ticketId));
    await repos.orders.applyState(ticketId, state, { at, by: actor.id, reason });
  }

  /**
   * Legacy `anular_ticket`. Closed sessions are immutable: the cash guard runs FIRST, before any write.
   * A cashier can only void their own tickets; an admin can void any.
   */
  async function voidTicket(input: { actor: Actor; ticketId: string; reason: string }): Promise<void> {
    const reason = requireReason(input.reason, "El motivo es obligatorio.");
    for (const sessionId of await repos.movements.cashSessionIdsByTicket(input.ticketId)) {
      await repos.cash.assertSessionAllowsVoid(sessionId);
    }
    const rows = await repos.movements.listActiveSalesByTicket(
      input.ticketId,
      input.actor.role === "cashier" ? input.actor.id : undefined,
    );
    if (rows.length === 0) throw new LedgerError("No se encontró el ticket o ya estaba anulado.");
    const at = runtime.clock.now();
    for (const row of rows) await voidRow(row, input.actor, reason, at);
    await syncOrderState(input.ticketId, input.actor, reason, at);
  }

  /** Legacy `anular_movimiento_por_id` (admin only; the cash guard runs before any write). */
  async function voidMovement(input: { actor: Actor; movementId: string; reason: string }): Promise<void> {
    assertAdmin(input.actor);
    const reason = requireReason(input.reason, "El motivo de anulación es obligatorio.");
    const movement = await repos.movements.findById(input.movementId);
    if (!movement) throw new LedgerError("No se encontró el movimiento.");
    if (movement.voided) throw new LedgerError("El movimiento ya estaba anulado.");
    if (movement.cashSessionId) await repos.cash.assertSessionAllowsVoid(movement.cashSessionId);
    const at = runtime.clock.now();
    await voidRow(movement, input.actor, reason, at);
    if (movement.kind === "Venta" && movement.ticketId) await syncOrderState(movement.ticketId, input.actor, reason, at);
  }

  return {
    registerSaleTicket,
    createAdminMovement,
    registerExpense,
    registerPurchase,
    registerAdminSale,
    recordStockAdjustment,
    adjustStock,
    voidTicket,
    voidMovement,
  };
}

export type LedgerService = ReturnType<typeof createLedgerService>;
