import type { UnitOfWork } from "@/shared/application/unit-of-work";
import type { InventoryProduct, RecipeComponent, StockLevel, StockMovement } from "../../domain";

/** Read model over catalog products + the single write inventory performs on them (the "compound" flags). */
export interface InventoryProductRepository {
  findById(id: string): Promise<InventoryProduct | null>;
  /** Sets `controlsStock = false` and `isCompound = true` (a recipe product has no stock of its own). */
  markAsCompound(id: string, actorId: string, at: Date): Promise<void>;
}

export interface StockLevelRepository {
  /** Current quantity (0 when the product never had stock). `lock: true` takes a row lock (FOR UPDATE) until the transaction ends. */
  quantity(productId: string, options?: { lock?: boolean }): Promise<number>;
  quantities(productIds: string[]): Promise<Map<string, number>>;
  set(productId: string, quantity: number, at: Date, actorId: string): Promise<void>;
  listAll(): Promise<StockLevel[]>;
}

export interface RecipeRepository {
  listBySaleProduct(saleProductId: string): Promise<RecipeComponent[]>;
  /** Insert, or update in place when (saleProductId, componentId) already exists (keeps the id). */
  upsert(component: RecipeComponent): Promise<void>;
  delete(recipeId: string, saleProductId: string): Promise<void>;
}

export interface StockMovementRepository {
  existsByOriginKey(key: string): Promise<boolean>;
  /** Any not-yet-reverted stock movement caused by this ledger movement. */
  hasActiveForMovement(movementId: string): Promise<boolean>;
  /** Must throw InventoryError("Este movimiento ya impactó el inventario.") on a duplicate origin key. */
  insert(movement: StockMovement): Promise<void>;
  listActiveByMovement(movementId: string): Promise<StockMovement[]>;
  markReverted(id: string, at: Date, by: string): Promise<void>;
  /** Newest first. */
  listByProduct(productId: string, limit: number): Promise<StockMovement[]>;
}

export interface InventoryRepositories {
  products: InventoryProductRepository;
  stock: StockLevelRepository;
  recipes: RecipeRepository;
  movements: StockMovementRepository;
}

export type InventoryUnitOfWork = UnitOfWork<InventoryRepositories>;
