/** Stock movement `type` values are the legacy codes: they are user-visible in the product history. */
export type StockMovementType =
  | "CONSUMO_VENTA"
  | "MOVIMIENTO_DIRECTO"
  | "AJUSTE_FISICO"
  | "INGRESO_COMPRA"
  | "AJUSTE_ADMIN"
  | (string & {});

/** Append-only audit row of every stock change (legacy: movimientos_stock). */
export interface StockMovement {
  id: string;
  /** Id of the ledger movement (sale, purchase, adjustment) that caused it. Owned by the ledger module. */
  movementId: string;
  productId: string;
  quantityDelta: number;
  type: StockMovementType;
  reason: string;
  stockBefore: number;
  stockAfter: number;
  actorId: string;
  referenceType: string;
  referenceId: string;
  /** Idempotency key: at most one stock movement per key, even after a reversal. */
  originKey: string | null;
  createdAt: Date;
  reverted: boolean;
  revertedAt: Date | null;
  revertedBy: string | null;
}

/** One ingredient of a recipe: `quantity` in `unit` is converted to `stockQuantity` in the component's stock unit. */
export interface RecipeComponent {
  id: string;
  saleProductId: string;
  componentId: string;
  quantity: number;
  unit: string;
  stockQuantity: number;
  createdAt: Date;
  createdBy: string;
}

/** Recipe row enriched for display. */
export interface RecipeLine {
  id: string;
  componentId: string;
  componentName: string;
  quantity: number;
  unit: string;
  stockQuantity: number;
  stockUnit: string;
}

export interface StockLevel {
  productId: string;
  quantity: number;
}

/** What inventory needs to know about a catalog product (read model; the catalog module owns the data). */
export interface InventoryProduct {
  id: string;
  name: string;
  active: boolean;
  controlsStock: boolean;
  isCompound: boolean;
  stockUnit: string;
  isPurchasable: boolean;
  purchaseFactor: number;
  categoryName: string | null;
}

/** product id -> quantity of that stock-controlled product needed. */
export type StockRequirements = Record<string, number>;

export interface StockAdjustmentResult {
  movementId: string;
  productId: string;
  productName: string;
  categoryName: string | null;
  previousStock: number;
  newStock: number;
  delta: number;
}

/** Validated adjustment that has not been written yet. */
export interface StockAdjustmentPlan {
  productId: string;
  productName: string;
  categoryName: string | null;
  previousStock: number;
  newStock: number;
  delta: number;
  /** Trimmed reason. */
  reason: string;
}
