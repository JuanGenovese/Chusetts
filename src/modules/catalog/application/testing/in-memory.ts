import { CatalogError, type MovementCategory, type PaymentMethod, type Product, type ProductCategory, type Supplier, type Unit } from "../../domain";
import { defaultSku } from "../../domain";
import type { Clock, IdGenerator } from "@/shared/application/runtime";
import type {
  CatalogInventoryCollaborator,
  CatalogRepositories,
  CatalogUnitOfWork,
  NewProduct,
} from "../ports/repositories";

type StoredProduct = Omit<Product, "categoryName" | "stockUnitName" | "supplierName">;

const lower = (s: string) => s.toLowerCase();
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Fake of the inventory collaborator: records calls and mimics its side effects on the product flags. */
export class FakeInventoryCollaborator implements CatalogInventoryCollaborator {
  initialStock: { productId: string; quantity: number; actorId: string }[] = [];
  recipes: { saleProductId: string; componentId: string; quantity: number; unit: string | null }[] = [];
  failOnRecipe: Error | null = null;
  private n = 0;

  constructor(private readonly store: InMemoryCatalogStore) {}

  async recordInitialStock(input: { productId: string; quantity: number; actorId: string }) {
    this.initialStock.push(input);
    this.n += 1;
    return { movementId: `stock-movement-${this.n}` };
  }
  async hasRecipe(productId: string) {
    return this.recipes.some((r) => r.saleProductId === productId);
  }
  async setRecipeComponent(input: { saleProductId: string; componentId: string; quantity: number; unit: string | null; actorId: string }) {
    if (this.failOnRecipe) throw this.failOnRecipe;
    this.recipes.push({ saleProductId: input.saleProductId, componentId: input.componentId, quantity: input.quantity, unit: input.unit });
    const p = this.store.products.get(input.saleProductId);
    if (p) Object.assign(p, { controlsStock: false, isCompound: true });
  }
}

/** In-memory fakes for unit tests. The UoW snapshots state and restores it when the work throws. */
export class InMemoryCatalogStore {
  products = new Map<string, StoredProduct>();
  categories = new Map<string, ProductCategory>();
  suppliers = new Map<string, Supplier>();
  units = new Map<string, Unit>();
  paymentMethods = new Map<string, PaymentMethod>();
  movementCategories: MovementCategory[] = [];
  private productSeq = 0;
  readonly now = new Date("2026-08-30T15:00:00Z");

  /** Mirrors the reference data the real seed creates. */
  seedReferenceData() {
    const units: [string, string, Unit["magnitude"], number][] = [
      ["unidad", "Unidad", "unidad", 1],
      ["ml", "Mililitro", "volumen", 1],
      ["oz", "Onza", "volumen", 29.5735],
      ["l", "Litro", "volumen", 1000],
      ["g", "Gramo", "peso", 1],
      ["gr", "Gramo", "peso", 1],
      ["kg", "Kilogramo", "peso", 1000],
    ];
    for (const [code, name, magnitude, baseFactor] of units) {
      this.units.set(`unit-${code}`, { id: `unit-${code}`, code, name, magnitude, baseFactor, active: true });
    }
    const methods: [string, string, number][] = [
      ["EFECTIVO", "Efectivo", 10],
      ["TRANSFERENCIA", "Transferencia", 20],
      ["TARJETA", "Tarjeta", 30],
      ["MERCADO_PAGO", "Mercado Pago", 40],
      ["OTRO", "Otro", 90],
    ];
    for (const [code, name, sequence] of methods) {
      this.paymentMethods.set(`pm-${code}`, { id: `pm-${code}`, code, name, sequence, active: true });
    }
    const movementCategories: [string, MovementCategory["kind"]][] = [
      ["Venta mostrador", "Ingreso"], ["Venta evento", "Ingreso"], ["Delivery", "Ingreso"],
      ["Alquiler", "Gasto"], ["Sueldos", "Gasto"], ["Servicios", "Gasto"], ["Mercadería", "Gasto"],
      ["Descartables", "Gasto"], ["Impuestos", "Gasto"], ["Marketing", "Gasto"], ["Mantenimiento", "Gasto"],
      ["Compra cerveza", "Compra"], ["Compra comida", "Compra"], ["Compra bebida", "Compra"], ["Compra insumos", "Compra"],
    ];
    this.movementCategories = movementCategories.map(([name, kind], i) => ({ id: `mc-${i}`, name, kind, active: true }));
    this.categories.set("cat-general", {
      id: "cat-general", name: "General", active: true, sequence: 10, createdAt: this.now, updatedAt: null, updatedBy: null,
    });
  }

  snapshot() {
    return structuredClone({
      products: this.products,
      categories: this.categories,
      suppliers: this.suppliers,
      units: this.units,
      paymentMethods: this.paymentMethods,
      productSeq: this.productSeq,
    });
  }

  restore(s: ReturnType<InMemoryCatalogStore["snapshot"]>) {
    this.products = s.products;
    this.categories = s.categories;
    this.suppliers = s.suppliers;
    this.units = s.units;
    this.paymentMethods = s.paymentMethods;
    this.productSeq = s.productSeq;
  }

  private view(p: StoredProduct): Product {
    return structuredClone({
      ...p,
      categoryName: this.categories.get(p.categoryId)?.name ?? "",
      stockUnitName: this.units.get(p.stockUnitId)?.name ?? "",
      supplierName: p.supplierId ? (this.suppliers.get(p.supplierId)?.name ?? null) : null,
    });
  }

  private assertUnique(name: string, sku: string, exceptId: string | null) {
    for (const other of this.products.values()) {
      if (other.id === exceptId) continue;
      if (other.name === name) throw new CatalogError("Ya existe un producto con ese nombre.");
      if (sku && other.sku === sku) throw new CatalogError("Ya existe un producto con ese código.");
    }
  }

  persistence(): Omit<CatalogRepositories, "inventory"> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- fakes close over the store
    const store = this;
    return {
      products: {
        async findById(id) {
          const p = store.products.get(id);
          return p ? store.view(p) : null;
        },
        async list({ sellableOnly, includeInactive }) {
          return [...store.products.values()]
            .filter((p) => (includeInactive || p.active) && (!sellableOnly || p.isSellable))
            .map((p) => store.view(p))
            .sort(
              (a, b) =>
                Number(b.active) - Number(a.active) || cmp(a.categoryName, b.categoryName) || cmp(a.name, b.name),
            );
        },
        async insert(input: NewProduct) {
          store.assertUnique(input.name, input.sku, null);
          store.productSeq += 1;
          const stored: StoredProduct = { ...input, number: store.productSeq, sku: input.sku || defaultSku(store.productSeq) };
          store.products.set(stored.id, stored);
          return store.view(stored);
        },
        async update(input) {
          const current = store.products.get(input.id);
          if (!current) return false;
          store.assertUnique(input.name, input.sku, input.id);
          store.products.set(input.id, { ...current, ...input, sku: input.sku || current.sku });
          return true;
        },
        async setActive(id, active, at, actorId) {
          const p = store.products.get(id);
          if (p && p.active !== active) Object.assign(p, { active, updatedAt: at, updatedBy: actorId });
        },
        async countActiveBySupplier(supplierId) {
          return [...store.products.values()].filter((p) => p.supplierId === supplierId && p.active).length;
        },
      },
      categories: {
        async findById(id) {
          return structuredClone(store.categories.get(id) ?? null);
        },
        async findByName(name) {
          return structuredClone([...store.categories.values()].find((c) => lower(c.name) === lower(name)) ?? null);
        },
        async existsByName(name, excludeId) {
          return [...store.categories.values()].some((c) => lower(c.name) === lower(name) && c.id !== excludeId);
        },
        async list({ activeOnly }) {
          return [...store.categories.values()]
            .filter((c) => !activeOnly || c.active)
            .map((c) => ({
              ...structuredClone(c),
              assignedProducts: [...store.products.values()].filter((p) => p.categoryId === c.id && p.active).length,
            }))
            .sort((a, b) => Number(b.active) - Number(a.active) || a.sequence - b.sequence || cmp(a.name, b.name));
        },
        async insert(category) {
          store.categories.set(category.id, structuredClone(category));
        },
        async update(category) {
          if (!store.categories.has(category.id)) return false;
          store.categories.set(category.id, structuredClone(category));
          return true;
        },
        async countActiveProducts(categoryId) {
          return [...store.products.values()].filter((p) => p.categoryId === categoryId && p.active).length;
        },
      },
      suppliers: {
        async findById(id) {
          return structuredClone(store.suppliers.get(id) ?? null);
        },
        async findByName(name) {
          return structuredClone([...store.suppliers.values()].find((s) => lower(s.name) === lower(name)) ?? null);
        },
        async existsByName(name, excludeId) {
          return [...store.suppliers.values()].some((s) => lower(s.name) === lower(name) && s.id !== excludeId);
        },
        async existsByTaxId(taxId, excludeId) {
          return [...store.suppliers.values()].some((s) => s.taxId === taxId && s.id !== excludeId);
        },
        async list({ activeOnly }) {
          return structuredClone(
            [...store.suppliers.values()]
              .filter((s) => !activeOnly || s.active)
              .sort((a, b) => Number(b.active) - Number(a.active) || cmp(a.name, b.name)),
          );
        },
        async insert(supplier) {
          store.suppliers.set(supplier.id, structuredClone(supplier));
        },
        async update(supplier) {
          if (!store.suppliers.has(supplier.id)) return false;
          store.suppliers.set(supplier.id, structuredClone(supplier));
          return true;
        },
      },
      units: {
        async findActiveByCode(code) {
          return structuredClone([...store.units.values()].find((u) => u.code === code && u.active) ?? null);
        },
        async list({ activeOnly }) {
          const rank = (u: Unit) => (u.magnitude === "unidad" ? 1 : u.magnitude === "volumen" ? 2 : 3);
          return structuredClone(
            [...store.units.values()]
              .filter((u) => !activeOnly || u.active)
              .sort((a, b) => rank(a) - rank(b) || a.baseFactor - b.baseFactor || cmp(a.name, b.name) || cmp(a.code, b.code)),
          );
        },
        async setActive(id, active) {
          const unit = store.units.get(id);
          if (!unit) return false;
          unit.active = active;
          return true;
        },
      },
      paymentMethods: {
        async findActiveByName(name) {
          return structuredClone([...store.paymentMethods.values()].find((m) => lower(m.name) === lower(name) && m.active) ?? null);
        },
        async list({ activeOnly }) {
          return structuredClone(
            [...store.paymentMethods.values()]
              .filter((m) => !activeOnly || m.active)
              .sort((a, b) => Number(b.active) - Number(a.active) || a.sequence - b.sequence || cmp(a.name, b.name)),
          );
        },
        async setActive(id, active) {
          const method = store.paymentMethods.get(id);
          if (!method) return false;
          method.active = active;
          return true;
        },
      },
      movementCategories: {
        async listNames(kind) {
          return store.movementCategories
            .filter((c) => c.active && (!kind || c.kind === kind))
            .map((c) => c.name)
            .sort(cmp);
        },
        async findActiveByName(name, kind) {
          const found = store.movementCategories.find(
            (c) => c.active && lower(c.name) === lower(name.trim()) && (!kind || c.kind === kind),
          );
          return found ? { ...found } : null;
        },
      },
    };
  }

  unitOfWork(inventory: CatalogInventoryCollaborator): CatalogUnitOfWork {
    return {
      run: async (work) => {
        const before = this.snapshot();
        try {
          return await work({ ...this.persistence(), inventory });
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

export function makeCatalogTestDeps() {
  const store = new InMemoryCatalogStore();
  store.seedReferenceData();
  const inventory = new FakeInventoryCollaborator(store);
  return { store, inventory, deps: { uow: store.unitOfWork(inventory), clock: new FixedClock(), ids: new SequentialIds() } };
}
