import type { StockMovement } from "../domain";
import type { InventoryDeps } from "./deps";
import { createInventoryService, type InventoryService } from "./inventory-service";

/**
 * Stand-alone use cases: each call runs in ITS OWN unit of work (one DB transaction).
 * Other modules that must combine inventory with their own writes use `createInventoryService(repos, runtime)`
 * inside their own unit of work instead.
 */
export const inventoryUseCases = (deps: InventoryDeps) => {
  const run =
    <A extends unknown[], R>(op: (service: InventoryService, ...args: A) => Promise<R>) =>
    (...args: A): Promise<R> =>
      deps.uow.run((repos) => op(createInventoryService(repos, deps), ...args));

  return {
    stockRequirements: run((s, input: { productId: string; saleQuantity?: number }) =>
      s.stockRequirements(input.productId, input.saleQuantity ?? 1),
    ),
    availableSaleQuantity: run((s, productId: string) => s.availableSaleQuantity(productId)),
    availableSaleQuantities: run((s, productIds: string[]) => s.availableSaleQuantities(productIds)),
    purchaseToStockQuantity: run((s, input: { productId: string; purchaseQuantity: number }) =>
      s.purchaseToStockQuantity(input.productId, input.purchaseQuantity),
    ),
    consumeSaleStock: run((s, input: Parameters<InventoryService["consumeSaleStock"]>[0]) => s.consumeSaleStock(input)),
    applyDirectStockDelta: run((s, input: Parameters<InventoryService["applyDirectStockDelta"]>[0]) =>
      s.applyDirectStockDelta(input),
    ),
    planStockAdjustment: run((s, input: Parameters<InventoryService["planStockAdjustment"]>[0]) =>
      s.planStockAdjustment(input),
    ),
    createStockAdjustment: run((s, input: Parameters<InventoryService["createStockAdjustment"]>[0]) =>
      s.createStockAdjustment(input),
    ),
    reverseMovementStock: run((s, input: Parameters<InventoryService["reverseMovementStock"]>[0]) =>
      s.reverseMovementStock(input),
    ),
    setRecipeComponent: run((s, input: Parameters<InventoryService["setRecipeComponent"]>[0]) =>
      s.setRecipeComponent(input),
    ),
    removeRecipeComponent: run((s, input: Parameters<InventoryService["removeRecipeComponent"]>[0]) =>
      s.removeRecipeComponent(input),
    ),
    getRecipe: run((s, saleProductId: string) => s.getRecipe(saleProductId)),
    hasRecipe: run((s, productId: string) => s.hasRecipe(productId)),
    getStockLevel: run((s, productId: string) => s.getStockLevel(productId)),
    listStockLevels: run((s) => s.listStockLevels()),
    listStockMovements: run(
      (s, input: { productId: string; limit?: number }): Promise<StockMovement[]> =>
        s.listStockMovements(input.productId, input.limit),
    ),
  };
};

export type InventoryUseCases = ReturnType<typeof inventoryUseCases>;
