import type { Cents } from "@/shared/domain/money";
import type { UnitOfWork } from "@/shared/application/unit-of-work";
import type { LedgerMovement, MovementKind, SaleOrder, SaleOrderLine, SaleOrderStatus } from "../../domain";

// ---- persistence owned by the ledger ---------------------------------------------------------------------------

export interface LedgerMovementRepository {
  /** Assigns `number` (legacy id). Ledger rows are inserted BEFORE the stock/cash rows that reference them. */
  insert(movement: LedgerMovement): Promise<void>;
  findById(id: string): Promise<LedgerMovement | null>;
  /** Cash sessions of every movement of a ticket (any owner, voided or not). */
  cashSessionIdsByTicket(ticketId: string): Promise<string[]>;
  /** Active (not voided) "Venta" rows of a ticket, oldest first. `createdBy` restricts to one user's rows. */
  listActiveSalesByTicket(ticketId: string, createdBy?: string): Promise<LedgerMovement[]>;
  /** Count and total of the ticket's active "Venta" rows. */
  activeSalesSummary(ticketId: string): Promise<{ activeCount: number; activeTotal: Cents }>;
  markVoided(id: string, data: { reason: string; by: string; at: Date }): Promise<void>;
}

export interface SaleOrderRepository {
  insert(order: SaleOrder): Promise<void>;
  insertLine(line: SaleOrderLine): Promise<void>;
  /** Legacy `sync_order_state` write: always sets the total; voiding fields only when `status` is VOIDED. */
  applyState(
    ticketId: string,
    state: { status: SaleOrderStatus; total: Cents },
    voided: { at: Date; by: string; reason: string },
  ): Promise<void>;
}

// ---- collaborators implemented in the composition root with the other modules' PUBLIC APIs --------------------
// (same transaction as the ledger writes; modules never import each other's internals)

export interface StockAdjustmentPlanView {
  productId: string;
  productName: string;
  categoryName: string | null;
  previousStock: number;
  newStock: number;
  delta: number;
  reason: string;
}

/** Inventory: stock effects of ledger movements. */
export interface LedgerStockCollaborator {
  consumeSaleStock(input: { movementId: string; productId: string; quantity: number; actorId: string }): Promise<void>;
  /** Purchase presentation quantity -> stock units (validates the product is purchasable). */
  purchaseToStockQuantity(productId: string, purchaseQuantity: number): Promise<number>;
  applyDirectStockDelta(input: {
    movementId: string;
    productId: string;
    quantityDelta: number;
    actorId: string;
    movementType: string;
    reason: string;
  }): Promise<void>;
  planStockAdjustment(input: { productId: string; countedStock: number; reason: string }): Promise<StockAdjustmentPlanView>;
  createStockAdjustment(input: {
    movementId: string;
    productId: string;
    countedStock: number;
    actorId: string;
    reason: string;
  }): Promise<void>;
  /** Gives back the stock of a voided movement; returns how many stock rows were reversed. */
  reverseMovementStock(input: { movementId: string; actorId: string }): Promise<number>;
}

/** Cash: the sales/expense hooks and the void guard. */
export interface LedgerCashCollaborator {
  findOpenSession(userId: string): Promise<{ id: string } | null>;
  /** Rejects when the session is closed (closed sessions are immutable). Must run BEFORE any write of a void. */
  assertSessionAllowsVoid(sessionId: string): Promise<void>;
  recordCashSale(input: { sessionId: string; saleMovementId: string; actorId: string; amount: Cents; description: string }): Promise<void>;
  recordCashExpense(input: { sessionId: string; expenseMovementId: string; actorId: string; amount: Cents; description: string }): Promise<void>;
  recordCashReversal(input: {
    originalMovementId: string;
    sessionId: string | null;
    kind: "sale" | "expense" | "purchase";
    paidInCash: boolean;
    amount: Cents;
    description: string;
    actorId: string;
    reason: string;
  }): Promise<void>;
}

export interface LedgerProduct {
  id: string;
  name: string;
  categoryName: string | null;
  salePrice: Cents;
  active: boolean;
}

export interface LedgerPaymentMethod {
  id: string;
  name: string;
  code: string;
}

/** Catalog: read-only master data. */
export interface LedgerCatalogCollaborator {
  getProduct(id: string): Promise<LedgerProduct | null>;
  /** Active method by display name (case-insensitive); throws "El medio de pago no existe o está inactivo.". */
  resolveActivePaymentMethod(name: string): Promise<LedgerPaymentMethod>;
  /** Any method (active or not) by id. */
  getPaymentMethod(id: string): Promise<LedgerPaymentMethod | null>;
  getSupplier(id: string): Promise<{ id: string; name: string } | null>;
  findMovementCategory(name: string, kind: MovementKind): Promise<{ id: string; name: string } | null>;
}

export interface LedgerPersistence {
  movements: LedgerMovementRepository;
  orders: SaleOrderRepository;
}

export interface LedgerRepositories extends LedgerPersistence {
  stock: LedgerStockCollaborator;
  cash: LedgerCashCollaborator;
  catalog: LedgerCatalogCollaborator;
}

export type LedgerUnitOfWork = UnitOfWork<LedgerRepositories>;
