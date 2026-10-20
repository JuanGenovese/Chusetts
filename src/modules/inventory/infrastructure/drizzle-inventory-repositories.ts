import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { DbExecutor } from "@/shared/infrastructure/db/client";
import { PG_UNIQUE_VIOLATION, pgErrorInfo } from "@/shared/infrastructure/db/errors";
import {
  productCategories,
  products,
  recipeComponents,
  stockLevels,
  stockMovements,
} from "@/shared/infrastructure/db/schema";
import { InventoryError, type InventoryProduct, type RecipeComponent, type StockLevel, type StockMovement } from "../domain";
import type {
  InventoryProductRepository,
  InventoryRepositories,
  RecipeRepository,
  StockLevelRepository,
  StockMovementRepository,
} from "../application/ports";

type MovementRow = typeof stockMovements.$inferSelect;

function toMovement(row: MovementRow): StockMovement {
  return {
    id: row.id,
    movementId: row.movementId,
    productId: row.productId,
    quantityDelta: row.quantityDelta,
    type: row.type,
    reason: row.reason,
    stockBefore: row.stockBefore,
    stockAfter: row.stockAfter,
    actorId: row.actorId,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    originKey: row.originKey,
    createdAt: row.createdAt,
    reverted: row.reverted,
    revertedAt: row.revertedAt,
    revertedBy: row.revertedBy,
  };
}

/** Read model over the catalog's `products` table (+ the compound-flag write a recipe implies). */
class DrizzleInventoryProductRepository implements InventoryProductRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(id: string): Promise<InventoryProduct | null> {
    const [row] = await this.db
      .select({
        id: products.id,
        name: products.name,
        active: products.active,
        controlsStock: products.controlsStock,
        isCompound: products.isCompound,
        stockUnit: products.stockUnit,
        isPurchasable: products.isPurchasable,
        purchaseFactor: products.purchaseFactor,
        categoryName: productCategories.name,
      })
      .from(products)
      .leftJoin(productCategories, eq(productCategories.id, products.categoryId))
      .where(eq(products.id, id))
      .limit(1);
    return row ?? null;
  }

  async markAsCompound(id: string, actorId: string, at: Date): Promise<void> {
    await this.db
      .update(products)
      .set({ controlsStock: false, isCompound: true, updatedAt: at, updatedBy: actorId })
      .where(eq(products.id, id));
  }
}

class DrizzleStockLevelRepository implements StockLevelRepository {
  constructor(private readonly db: DbExecutor) {}

  async quantity(productId: string, options?: { lock?: boolean }): Promise<number> {
    if (options?.lock) {
      // Make sure the row exists, then lock it: concurrent movements of the same product serialize here.
      await this.db.insert(stockLevels).values({ productId, quantity: 0 }).onConflictDoNothing();
      const [row] = await this.db
        .select({ quantity: stockLevels.quantity })
        .from(stockLevels)
        .where(eq(stockLevels.productId, productId))
        .for("update");
      return row.quantity;
    }
    const [row] = await this.db.select({ quantity: stockLevels.quantity }).from(stockLevels).where(eq(stockLevels.productId, productId));
    return row?.quantity ?? 0;
  }

  async quantities(productIds: string[]): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map();
    const rows = await this.db
      .select({ productId: stockLevels.productId, quantity: stockLevels.quantity })
      .from(stockLevels)
      .where(inArray(stockLevels.productId, productIds));
    const result = new Map(productIds.map((id) => [id, 0]));
    for (const row of rows) result.set(row.productId, row.quantity);
    return result;
  }

  async set(productId: string, quantity: number, at: Date, actorId: string): Promise<void> {
    await this.db
      .insert(stockLevels)
      .values({ productId, quantity, updatedAt: at, updatedBy: actorId })
      .onConflictDoUpdate({ target: stockLevels.productId, set: { quantity, updatedAt: at, updatedBy: actorId } });
  }

  async listAll(): Promise<StockLevel[]> {
    return this.db.select({ productId: stockLevels.productId, quantity: stockLevels.quantity }).from(stockLevels);
  }
}

class DrizzleRecipeRepository implements RecipeRepository {
  constructor(private readonly db: DbExecutor) {}

  async listBySaleProduct(saleProductId: string): Promise<RecipeComponent[]> {
    return this.db
      .select()
      .from(recipeComponents)
      .where(eq(recipeComponents.saleProductId, saleProductId))
      .orderBy(asc(recipeComponents.createdAt), asc(recipeComponents.id));
  }

  async upsert(component: RecipeComponent): Promise<void> {
    await this.db
      .insert(recipeComponents)
      .values(component)
      .onConflictDoUpdate({
        target: [recipeComponents.saleProductId, recipeComponents.componentId],
        set: {
          quantity: component.quantity,
          unit: component.unit,
          stockQuantity: component.stockQuantity,
          createdAt: component.createdAt,
          createdBy: component.createdBy,
        },
      });
  }

  async delete(recipeId: string, saleProductId: string): Promise<void> {
    await this.db
      .delete(recipeComponents)
      .where(and(eq(recipeComponents.id, recipeId), eq(recipeComponents.saleProductId, saleProductId)));
  }
}

class DrizzleStockMovementRepository implements StockMovementRepository {
  constructor(private readonly db: DbExecutor) {}

  async existsByOriginKey(key: string): Promise<boolean> {
    const rows = await this.db.select({ id: stockMovements.id }).from(stockMovements).where(eq(stockMovements.originKey, key)).limit(1);
    return rows.length > 0;
  }

  async hasActiveForMovement(movementId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: stockMovements.id })
      .from(stockMovements)
      .where(and(eq(stockMovements.movementId, movementId), eq(stockMovements.reverted, false)))
      .limit(1);
    return rows.length > 0;
  }

  async insert(movement: StockMovement): Promise<void> {
    try {
      await this.db.insert(stockMovements).values(movement);
    } catch (error) {
      const { code, constraint } = pgErrorInfo(error);
      if (code === PG_UNIQUE_VIOLATION && constraint === "stock_movements_origin_key_unique") {
        throw new InventoryError("Este movimiento ya impactó el inventario.");
      }
      throw error;
    }
  }

  async listActiveByMovement(movementId: string): Promise<StockMovement[]> {
    const rows = await this.db
      .select()
      .from(stockMovements)
      .where(and(eq(stockMovements.movementId, movementId), eq(stockMovements.reverted, false)))
      .orderBy(asc(stockMovements.sequence));
    return rows.map(toMovement);
  }

  async markReverted(id: string, at: Date, by: string): Promise<void> {
    await this.db.update(stockMovements).set({ reverted: true, revertedAt: at, revertedBy: by }).where(eq(stockMovements.id, id));
  }

  async listByProduct(productId: string, limit: number): Promise<StockMovement[]> {
    const rows = await this.db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.productId, productId))
      .orderBy(desc(stockMovements.sequence))
      .limit(limit);
    return rows.map(toMovement);
  }
}

/** Repositories bound to one executor (a transaction inside a unit of work). */
export function createInventoryRepositories(db: DbExecutor): InventoryRepositories {
  return {
    products: new DrizzleInventoryProductRepository(db),
    stock: new DrizzleStockLevelRepository(db),
    recipes: new DrizzleRecipeRepository(db),
    movements: new DrizzleStockMovementRepository(db),
  };
}
