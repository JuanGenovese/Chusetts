import { InventoryError, type InventoryProduct, type RecipeComponent, type StockMovement } from "../../domain";
import type { Clock, IdGenerator } from "@/shared/application/runtime";
import type { InventoryRepositories, InventoryUnitOfWork } from "../ports/repositories";

interface StoredProduct extends InventoryProduct {
  isSellable: boolean;
}

export interface NewTestProduct {
  name: string;
  stock?: number;
  stockUnit?: string;
  controlsStock?: boolean;
  isSellable?: boolean;
  isCompound?: boolean;
  isPurchasable?: boolean;
  purchaseFactor?: number;
  active?: boolean;
  categoryName?: string | null;
}

/** In-memory fakes for unit tests. The UoW snapshots state and restores it when the work throws. */
export class InMemoryInventoryStore {
  products = new Map<string, StoredProduct>();
  levels = new Map<string, number>();
  recipes: RecipeComponent[] = [];
  stockMovements: StockMovement[] = [];
  private productSeq = 0;

  addProduct(input: NewTestProduct): string {
    this.productSeq += 1;
    const id = `p-${this.productSeq}`;
    this.products.set(id, {
      id,
      name: input.name,
      active: input.active ?? true,
      controlsStock: input.controlsStock ?? true,
      isCompound: input.isCompound ?? false,
      stockUnit: input.stockUnit ?? "unidad",
      isPurchasable: input.isPurchasable ?? true,
      purchaseFactor: input.purchaseFactor ?? 1,
      categoryName: input.categoryName ?? null,
      isSellable: input.isSellable ?? true,
    });
    if (input.stock) this.levels.set(id, input.stock);
    return id;
  }

  product(id: string) {
    return this.products.get(id)!;
  }

  stock(id: string) {
    return this.levels.get(id) ?? 0;
  }

  snapshot() {
    return structuredClone({
      products: this.products,
      levels: this.levels,
      recipes: this.recipes,
      stockMovements: this.stockMovements,
    });
  }

  restore(s: ReturnType<InMemoryInventoryStore["snapshot"]>) {
    this.products = s.products;
    this.levels = s.levels;
    this.recipes = s.recipes;
    this.stockMovements = s.stockMovements;
  }

  repositories(): InventoryRepositories {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- fakes close over the store
    const store = this;
    return {
      products: {
        async findById(id) {
          const p = store.products.get(id);
          if (!p) return null;
          const { isSellable: _ignored, ...view } = p;
          void _ignored;
          return structuredClone(view);
        },
        async markAsCompound(id) {
          const p = store.products.get(id);
          if (p) {
            p.controlsStock = false;
            p.isCompound = true;
          }
        },
      },
      stock: {
        async quantity(productId) {
          return store.levels.get(productId) ?? 0;
        },
        async quantities(ids) {
          return new Map(ids.map((id) => [id, store.levels.get(id) ?? 0]));
        },
        async set(productId, quantity) {
          store.levels.set(productId, quantity);
        },
        async listAll() {
          return [...store.levels].map(([productId, quantity]) => ({ productId, quantity }));
        },
      },
      recipes: {
        async listBySaleProduct(saleProductId) {
          return structuredClone(store.recipes.filter((r) => r.saleProductId === saleProductId));
        },
        async upsert(component) {
          const index = store.recipes.findIndex(
            (r) => r.saleProductId === component.saleProductId && r.componentId === component.componentId,
          );
          if (index >= 0) store.recipes[index] = { ...structuredClone(component), id: store.recipes[index].id };
          else store.recipes.push(structuredClone(component));
        },
        async delete(recipeId, saleProductId) {
          store.recipes = store.recipes.filter((r) => !(r.id === recipeId && r.saleProductId === saleProductId));
        },
      },
      movements: {
        async existsByOriginKey(key) {
          return store.stockMovements.some((m) => m.originKey === key);
        },
        async hasActiveForMovement(movementId) {
          return store.stockMovements.some((m) => m.movementId === movementId && !m.reverted);
        },
        async insert(movement) {
          if (movement.originKey && store.stockMovements.some((m) => m.originKey === movement.originKey)) {
            throw new InventoryError("Este movimiento ya impactó el inventario.");
          }
          store.stockMovements.push(structuredClone(movement));
        },
        async listActiveByMovement(movementId) {
          return structuredClone(store.stockMovements.filter((m) => m.movementId === movementId && !m.reverted));
        },
        async markReverted(id, at, by) {
          const m = store.stockMovements.find((x) => x.id === id);
          if (m) Object.assign(m, { reverted: true, revertedAt: at, revertedBy: by });
        },
        async listByProduct(productId, limit) {
          return structuredClone(
            store.stockMovements.filter((m) => m.productId === productId).reverse().slice(0, limit),
          );
        },
      },
    };
  }

  unitOfWork(): InventoryUnitOfWork {
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
    return `id-${this.n}`;
  }
}

export function makeInventoryTestDeps() {
  const store = new InMemoryInventoryStore();
  return { store, deps: { uow: store.unitOfWork(), clock: new FixedClock(), ids: new SequentialIds() } };
}
