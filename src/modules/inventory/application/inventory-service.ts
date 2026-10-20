import { STOCK_EPSILON, formatG, round9 } from "@/shared/domain/quantity";
import {
  InventoryError,
  convertQuantity,
  normalizeUnit,
  type RecipeLine,
  type StockAdjustmentPlan,
  type StockAdjustmentResult,
  type StockLevel,
  type StockMovement,
  type StockMovementType,
  type StockRequirements,
} from "../domain";
import type { InventoryRuntime } from "./deps";
import type { InventoryRepositories } from "./ports/repositories";

export interface ConsumeSaleStockInput {
  /** Id of the ledger movement (sale line) being fulfilled. */
  movementId: string;
  productId: string;
  quantity: number;
  actorId: string;
}

export interface ApplyDirectStockDeltaInput {
  movementId: string;
  productId: string;
  /** Positive = stock in (purchase), negative = stock out. In STOCK units (see `purchaseToStockQuantity`). */
  quantityDelta: number;
  actorId: string;
  /** Defaults to MOVIMIENTO_DIRECTO. Legacy callers pass INGRESO_COMPRA / AJUSTE_ADMIN. */
  movementType?: StockMovementType;
  reason?: string;
}

export interface CreateStockAdjustmentInput {
  productId: string;
  /** Physically counted stock. */
  countedStock: number;
  actorId: string;
  reason: string;
  /** Ledger movement id to attach the audit row to; generated when omitted. */
  movementId?: string;
}

export interface SetRecipeComponentInput {
  saleProductId: string;
  componentId: string;
  quantity: number;
  actorId: string;
  /** Unit of `quantity`; defaults to the component's stock unit. */
  unit?: string | null;
}

/**
 * Transaction-scoped inventory operations (ports `inventory_service.py`).
 *
 * They run on the repositories they are given and NEVER open a transaction themselves, so a caller
 * (e.g. the sales ledger) can call them from inside its own unit of work together with cash/catalog work:
 * if anything throws, everything rolls back.
 */
export function createInventoryService(repos: InventoryRepositories, runtime: InventoryRuntime) {
  async function stockRequirements(
    productId: string,
    saleQuantity = 1,
    path: readonly string[] = [],
  ): Promise<StockRequirements> {
    if (!(Number(saleQuantity) > 0)) throw new InventoryError("La cantidad vendida debe ser mayor que cero.");
    if (path.includes(productId)) throw new InventoryError("La receta contiene una referencia circular.");
    const product = await repos.products.findById(productId);
    if (!product || !product.active) throw new InventoryError("El producto no existe o está inactivo.");

    const components = await repos.recipes.listBySaleProduct(productId);
    if (components.length === 0) {
      if (product.isCompound) {
        throw new InventoryError(`“${product.name}” está marcado como compuesto pero no tiene receta.`);
      }
      if (!product.controlsStock) return {};
      return { [productId]: Number(saleQuantity) };
    }

    const result: StockRequirements = {};
    const nextPath = [...path, productId];
    for (const component of components) {
      const requiredComponent = Number(saleQuantity) * component.stockQuantity;
      const nested = await stockRequirements(component.componentId, requiredComponent, nextPath);
      for (const [id, required] of Object.entries(nested)) result[id] = (result[id] ?? 0) + required;
    }
    return result;
  }

  /** How many units of the product can still be sold. `null` = unlimited (no stock control, no recipe). */
  async function availableSaleQuantity(productId: string): Promise<number | null> {
    let requirements: StockRequirements;
    try {
      requirements = await stockRequirements(productId, 1);
    } catch (error) {
      if (error instanceof InventoryError) return 0;
      throw error;
    }
    const entries = Object.entries(requirements);
    if (entries.length === 0) return null;
    const stock = await repos.stock.quantities(entries.map(([id]) => id));
    return Math.max(0, Math.min(...entries.map(([id, required]) => (stock.get(id) ?? 0) / required)));
  }

  async function purchaseToStockQuantity(productId: string, purchaseQuantity: number): Promise<number> {
    if (!(Number(purchaseQuantity) > 0)) throw new InventoryError("La cantidad comprada debe ser mayor que cero.");
    const product = await repos.products.findById(productId);
    if (!product || !product.active) throw new InventoryError("El producto no existe o está inactivo.");
    if (!product.isPurchasable) throw new InventoryError("El producto no está habilitado para compras.");
    if (!(product.purchaseFactor > 0)) {
      throw new InventoryError("La conversión de compra a stock debe ser mayor que cero.");
    }
    return round9(Number(purchaseQuantity) * product.purchaseFactor);
  }

  async function applyDelta(params: {
    movementId: string;
    productId: string;
    quantityDelta: number;
    actorId: string;
    type: StockMovementType;
    reason: string;
    referenceType: string;
    referenceId: string;
    originKey: string;
  }): Promise<void> {
    if (await repos.movements.existsByOriginKey(params.originKey)) {
      throw new InventoryError("Este movimiento ya impactó el inventario.");
    }
    if (!(await repos.products.findById(params.productId))) {
      throw new InventoryError("El producto de stock no existe.");
    }
    const previous = await repos.stock.quantity(params.productId, { lock: true });
    const posterior = round9(previous + Number(params.quantityDelta));
    if (posterior < -STOCK_EPSILON) throw new InventoryError("El movimiento dejaría el stock en negativo.");
    const now = runtime.clock.now();
    await repos.stock.set(params.productId, posterior, now, params.actorId);
    await repos.movements.insert({
      id: runtime.ids.next(),
      movementId: params.movementId,
      productId: params.productId,
      quantityDelta: Number(params.quantityDelta),
      type: params.type,
      reason: params.reason,
      stockBefore: previous,
      stockAfter: posterior,
      actorId: params.actorId,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      originKey: params.originKey,
      createdAt: now,
      reverted: false,
      revertedAt: null,
      revertedBy: null,
    });
  }

  /** Consumes the stock a sale needs (recipes expanded). Returns the requirements it applied. */
  async function consumeSaleStock(input: ConsumeSaleStockInput): Promise<StockRequirements> {
    if (await repos.movements.hasActiveForMovement(input.movementId)) {
      throw new InventoryError("La venta ya impactó el inventario.");
    }
    const requirements = await stockRequirements(input.productId, input.quantity);
    const entries = Object.entries(requirements);
    // Lock in a deterministic order (by id) so concurrent sales sharing components cannot deadlock.
    const current = new Map<string, number>();
    for (const [componentId] of [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      current.set(componentId, await repos.stock.quantity(componentId, { lock: true }));
    }
    // Report and apply in recipe order, like the legacy app.
    const insufficient: string[] = [];
    for (const [componentId, required] of entries) {
      const available = current.get(componentId) ?? 0;
      if (available + STOCK_EPSILON < required) {
        const product = await repos.products.findById(componentId);
        insufficient.push(
          `${product?.name ?? componentId}: disponible ${formatG(available)} ${product?.stockUnit ?? ""}, requerido ${formatG(required)}`,
        );
      }
    }
    if (insufficient.length > 0) throw new InventoryError("Stock insuficiente. " + insufficient.join(" | "));

    for (const [componentId, required] of entries) {
      await applyDelta({
        movementId: input.movementId,
        productId: componentId,
        quantityDelta: -required,
        actorId: input.actorId,
        type: "CONSUMO_VENTA",
        reason: "Consumo por venta o receta",
        referenceType: "MOVIMIENTO_VENTA",
        referenceId: input.movementId,
        originKey: `VENTA:${input.movementId}:PRODUCTO:${componentId}`,
      });
    }
    return requirements;
  }

  async function applyDirectStockDelta(input: ApplyDirectStockDeltaInput): Promise<void> {
    const product = await repos.products.findById(input.productId);
    if (!product) throw new InventoryError("El producto no existe.");
    if (!product.controlsStock) {
      throw new InventoryError(`“${product.name}” usa una receta o no controla stock propio.`);
    }
    if (Math.abs(Number(input.quantityDelta)) <= 1e-12) {
      throw new InventoryError("El movimiento de stock no puede ser cero.");
    }
    const type = input.movementType ?? "MOVIMIENTO_DIRECTO";
    await applyDelta({
      movementId: input.movementId,
      productId: input.productId,
      quantityDelta: input.quantityDelta,
      actorId: input.actorId,
      type,
      reason: input.reason ?? "Movimiento de inventario",
      referenceType: "MOVIMIENTO",
      referenceId: input.movementId,
      originKey: `${type}:${input.movementId}:PRODUCTO:${input.productId}`,
    });
  }

  /**
   * Validates an adjustment and computes its delta WITHOUT writing (locks the stock row, like the write does).
   * The ledger uses it to insert its "Ajuste Stock" row (quantity = delta) before the stock audit row that references it.
   */
  async function planStockAdjustment(input: {
    productId: string;
    countedStock: number;
    reason: string;
  }): Promise<StockAdjustmentPlan> {
    const reason = input.reason.trim();
    if (!reason) throw new InventoryError("El motivo del ajuste es obligatorio.");
    if (Number(input.countedStock) < 0) throw new InventoryError("El stock físico contado no puede ser negativo.");
    const product = await repos.products.findById(input.productId);
    if (!product || !product.active) throw new InventoryError("El producto no existe o está inactivo.");
    if (!product.controlsStock) throw new InventoryError("Este producto no controla stock propio.");
    const previous = await repos.stock.quantity(input.productId, { lock: true });
    const delta = round9(Number(input.countedStock) - previous);
    if (Math.abs(delta) <= 1e-12) throw new InventoryError("El stock contado coincide con el stock del sistema.");
    return {
      productId: input.productId,
      productName: product.name,
      categoryName: product.categoryName,
      previousStock: previous,
      newStock: round9(previous + delta),
      delta,
      reason,
    };
  }

  async function createStockAdjustment(input: CreateStockAdjustmentInput): Promise<StockAdjustmentResult> {
    const plan = await planStockAdjustment(input);
    const movementId = input.movementId ?? runtime.ids.next();
    await applyDelta({
      movementId,
      productId: input.productId,
      quantityDelta: plan.delta,
      actorId: input.actorId,
      type: "AJUSTE_FISICO",
      reason: plan.reason,
      referenceType: "AJUSTE_STOCK",
      referenceId: movementId,
      originKey: `AJUSTE:${movementId}:PRODUCTO:${input.productId}`,
    });
    return {
      movementId,
      productId: plan.productId,
      productName: plan.productName,
      categoryName: plan.categoryName,
      previousStock: plan.previousStock,
      newStock: plan.newStock,
      delta: plan.delta,
    };
  }

  /**
   * Gives the stock of a voided ledger movement back. Idempotent: reversed rows are flagged and never reversed twice.
   * Like the legacy app, it may leave stock negative if the stock was meanwhile consumed (no negative guard here).
   */
  async function reverseMovementStock(input: { movementId: string; actorId: string }): Promise<number> {
    const rows = await repos.movements.listActiveByMovement(input.movementId);
    const now = runtime.clock.now();
    for (const row of rows) {
      const current = await repos.stock.quantity(row.productId, { lock: true });
      await repos.stock.set(row.productId, round9(current - row.quantityDelta), now, input.actorId);
      await repos.movements.markReverted(row.id, now, input.actorId);
    }
    return rows.length;
  }

  async function setRecipeComponent(input: SetRecipeComponentInput): Promise<void> {
    if (input.saleProductId === input.componentId) {
      throw new InventoryError("Un producto no puede consumirse a sí mismo.");
    }
    if (!(Number(input.quantity) > 0)) throw new InventoryError("La cantidad consumida debe ser mayor que cero.");
    const saleProduct = await repos.products.findById(input.saleProductId);
    const component = await repos.products.findById(input.componentId);
    if (!saleProduct || !saleProduct.active) throw new InventoryError("El producto vendido no existe o está inactivo.");
    if (!component || !component.active) throw new InventoryError("El componente no existe o está inactivo.");
    const recipeUnit = normalizeUnit(input.unit || component.stockUnit);
    const stockUnit = normalizeUnit(component.stockUnit);
    const canonicalQuantity = convertQuantity(input.quantity, recipeUnit, stockUnit);
    const now = runtime.clock.now();
    await repos.recipes.upsert({
      id: runtime.ids.next(),
      saleProductId: input.saleProductId,
      componentId: input.componentId,
      quantity: Number(input.quantity),
      unit: recipeUnit,
      stockQuantity: canonicalQuantity,
      createdAt: now,
      createdBy: input.actorId,
    });
    await repos.products.markAsCompound(input.saleProductId, input.actorId, now);
    // Detects circular references (and incomplete nested recipes); throwing rolls the unit of work back.
    await stockRequirements(input.saleProductId, 1);
  }

  async function removeRecipeComponent(input: { recipeId: string; saleProductId: string }): Promise<void> {
    await repos.recipes.delete(input.recipeId, input.saleProductId);
  }

  async function getRecipe(saleProductId: string): Promise<RecipeLine[]> {
    const rows = await repos.recipes.listBySaleProduct(saleProductId);
    const lines: RecipeLine[] = [];
    for (const row of rows) {
      const component = await repos.products.findById(row.componentId);
      lines.push({
        id: row.id,
        componentId: row.componentId,
        componentName: component?.name ?? "",
        quantity: row.quantity,
        unit: row.unit,
        stockQuantity: row.stockQuantity,
        stockUnit: component?.stockUnit ?? "",
      });
    }
    return lines.sort((a, b) => (a.componentName < b.componentName ? -1 : a.componentName > b.componentName ? 1 : 0));
  }

  return {
    stockRequirements: (productId: string, saleQuantity = 1) => stockRequirements(productId, saleQuantity),
    availableSaleQuantity,
    async availableSaleQuantities(productIds: string[]): Promise<Record<string, number | null>> {
      const result: Record<string, number | null> = {};
      for (const id of productIds) result[id] = await availableSaleQuantity(id);
      return result;
    },
    purchaseToStockQuantity,
    consumeSaleStock,
    applyDirectStockDelta,
    planStockAdjustment,
    createStockAdjustment,
    reverseMovementStock,
    setRecipeComponent,
    removeRecipeComponent,
    getRecipe,
    async hasRecipe(productId: string): Promise<boolean> {
      return (await repos.recipes.listBySaleProduct(productId)).length > 0;
    },
    getStockLevel: (productId: string): Promise<number> => repos.stock.quantity(productId),
    listStockLevels: (): Promise<StockLevel[]> => repos.stock.listAll(),
    listStockMovements: (productId: string, limit = 200): Promise<StockMovement[]> =>
      repos.movements.listByProduct(productId, limit),
  };
}

export type InventoryService = ReturnType<typeof createInventoryService>;
