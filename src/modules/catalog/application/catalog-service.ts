import type { Cents } from "@/shared/domain/money";
import {
  CatalogError,
  validateNewProduct,
  validateProductUpdate,
  validateSupplierValues,
  type ModelOption,
  type MovementCategory,
  type MovementCategoryKind,
  type PaymentMethod,
  type Product,
  type ProductCategory,
  type ProductCategoryRecord,
  type Supplier,
  type SupplierFields,
  type Unit,
} from "../domain";
import type { CatalogRuntime } from "./deps";
import type { CatalogRepositories } from "./ports/repositories";

export interface RecipeComponentInput {
  componentId: string;
  quantity: number;
  /** Unit of `quantity` (legacy: the "unidad" picker next to each Insumo). Defaults to the component's stock unit. */
  unit?: string | null;
}

export interface CreateProductInput {
  name: string;
  /** Preferred: an existing active category. */
  categoryId?: string | null;
  /** Fallback when no id: reuse a category by name (case-insensitive) or create it. */
  categoryName?: string;
  isSellable?: boolean;
  controlsStock?: boolean;
  salePrice?: Cents;
  unitCost?: Cents;
  initialStock?: number;
  minStock?: number;
  stockUnit?: string;
  sku?: string;
  description?: string;
  isPurchasable?: boolean;
  isSupply?: boolean;
  isCompound?: boolean;
  purchaseUnit?: string;
  purchaseFactor?: number;
  supplierId?: string | null;
  /** Recipe components saved in the same transaction ("Insumo 1/2/N"). A non-empty recipe makes the product compound. */
  recipe?: RecipeComponentInput[];
  actorId: string;
}

export interface CreateProductResult {
  product: Product;
  /** Present when initial stock > 0 was recorded; `movementId` is what the ledger attaches its "Ajuste Stock" row to. */
  initialStock: { movementId: string; quantity: number } | null;
}

export interface UpdateProductInput {
  id: string;
  name: string;
  categoryId?: string | null;
  categoryName?: string;
  isSellable: boolean;
  controlsStock: boolean;
  stockUnit: string;
  salePrice: Cents;
  unitCost: Cents;
  minStock: number;
  sku?: string;
  description?: string;
  isPurchasable?: boolean;
  isSupply?: boolean;
  isCompound?: boolean;
  purchaseUnit?: string;
  purchaseFactor?: number;
  supplierId?: string | null;
  actorId: string;
}

export interface SupplierInput extends SupplierFields {
  actorId: string;
}

const option = (id: string, name: string, code?: string): ModelOption => (code ? { id, name, code } : { id, name });

/**
 * Transaction-scoped catalog operations (ports `repository/products.py` + `repository/catalogs.py`).
 * They run on the repositories they are given and never open a transaction, so other modules can call them
 * from inside their own unit of work.
 */
export function createCatalogService(repos: CatalogRepositories, runtime: CatalogRuntime) {
  async function resolveCategory(categoryId: string | null | undefined, fallbackName: string): Promise<ProductCategory> {
    if (categoryId) {
      const found = await repos.categories.findById(categoryId);
      if (!found || !found.active) throw new CatalogError("La categoría seleccionada no existe o está inactiva.");
      return found;
    }
    const clean = fallbackName.trim();
    if (!clean) throw new CatalogError("La categoría es obligatoria.");
    const existing = await repos.categories.findByName(clean);
    if (existing) return existing;
    const created: ProductCategory = {
      id: runtime.ids.next(),
      name: clean,
      active: true,
      sequence: 10,
      createdAt: runtime.clock.now(),
      updatedAt: null,
      updatedBy: null,
    };
    await repos.categories.insert(created);
    return created;
  }

  async function resolveUnit(code: string): Promise<Unit> {
    const unit = await repos.units.findActiveByCode(code);
    if (!unit) throw new CatalogError("La unidad de medida seleccionada no existe o está inactiva.");
    return unit;
  }

  async function createProduct(input: CreateProductInput): Promise<CreateProductResult> {
    const recipe = input.recipe ?? [];
    const initialStock = input.initialStock ?? 0;
    const valid = validateNewProduct({
      name: input.name,
      stockUnit: input.stockUnit ?? "unidad",
      purchaseUnit: input.purchaseUnit ?? "unidad",
      purchaseFactor: input.purchaseFactor ?? 1,
      initialStock,
      minStock: input.minStock ?? 0,
      controlsStock: input.controlsStock ?? true,
      isCompound: (input.isCompound ?? false) || recipe.length > 0,
      salePrice: input.salePrice ?? 0,
      unitCost: input.unitCost ?? 0,
    });
    const category = await resolveCategory(input.categoryId, input.categoryName ?? "");
    const unit = await resolveUnit(valid.stockUnit);
    const now = runtime.clock.now();
    const created = await repos.products.insert({
      id: runtime.ids.next(),
      name: valid.name,
      sku: (input.sku ?? "").trim(),
      description: (input.description ?? "").trim(),
      categoryId: category.id,
      salePrice: input.salePrice ?? 0,
      unitCost: input.unitCost ?? 0,
      minStock: input.minStock ?? 0,
      active: true,
      isSellable: input.isSellable ?? true,
      isPurchasable: input.isPurchasable ?? true,
      isSupply: input.isSupply ?? false,
      isCompound: (input.isCompound ?? false) || recipe.length > 0,
      controlsStock: valid.controlsStock,
      stockUnit: valid.stockUnit,
      stockUnitId: unit.id,
      purchaseUnit: valid.purchaseUnit,
      purchaseFactor: valid.purchaseFactor,
      supplierId: input.supplierId ?? null,
      createdAt: now,
      updatedAt: now,
      updatedBy: input.actorId,
    });

    let initial: CreateProductResult["initialStock"] = null;
    if (initialStock > 0) {
      const { movementId } = await repos.inventory.recordInitialStock({
        productId: created.id,
        quantity: initialStock,
        actorId: input.actorId,
      });
      initial = { movementId, quantity: initialStock };
    }
    for (const component of recipe) {
      await repos.inventory.setRecipeComponent({
        saleProductId: created.id,
        componentId: component.componentId,
        quantity: component.quantity,
        unit: component.unit ?? null,
        actorId: input.actorId,
      });
    }
    // Re-read: setting a recipe flips the compound / stock-control flags.
    const product = recipe.length > 0 ? ((await repos.products.findById(created.id)) ?? created) : created;
    return { product, initialStock: initial };
  }

  async function updateProduct(input: UpdateProductInput): Promise<Product> {
    const valid = validateProductUpdate({
      name: input.name,
      stockUnit: input.stockUnit,
      purchaseUnit: input.purchaseUnit ?? "unidad",
      purchaseFactor: input.purchaseFactor ?? 1,
      minStock: input.minStock,
      salePrice: input.salePrice,
      unitCost: input.unitCost,
    });
    const category = await resolveCategory(input.categoryId, input.categoryName ?? "");
    const unit = await resolveUnit(valid.stockUnit);
    const current = await repos.products.findById(input.id);
    if (!current) throw new CatalogError("El producto no existe.");
    let isCompound = input.isCompound ?? false;
    let controlsStock = input.controlsStock;
    if (await repos.inventory.hasRecipe(input.id)) {
      isCompound = true;
      controlsStock = false;
    } else if (isCompound) {
      controlsStock = false;
    }
    const updated = await repos.products.update({
      id: input.id,
      name: valid.name,
      sku: (input.sku ?? "").trim(),
      description: (input.description ?? "").trim(),
      categoryId: category.id,
      salePrice: input.salePrice,
      unitCost: input.unitCost,
      minStock: input.minStock,
      isSellable: input.isSellable,
      isPurchasable: input.isPurchasable ?? true,
      isSupply: input.isSupply ?? false,
      isCompound,
      controlsStock,
      stockUnit: valid.stockUnit,
      stockUnitId: unit.id,
      purchaseUnit: valid.purchaseUnit,
      purchaseFactor: valid.purchaseFactor,
      supplierId: input.supplierId ?? null,
      updatedAt: runtime.clock.now(),
      updatedBy: input.actorId,
    });
    if (!updated) throw new CatalogError("El producto no existe.");
    return (await repos.products.findById(input.id))!;
  }

  // ---- product categories -------------------------------------------------------------------------------------

  async function getProductCategory(id: string): Promise<ProductCategoryRecord | null> {
    const category = await repos.categories.findById(id);
    if (!category) return null;
    return { ...category, assignedProducts: await repos.categories.countActiveProducts(id) };
  }

  async function createProductCategory(input: { name: string; sequence?: number; actorId: string }): Promise<ProductCategory> {
    const clean = input.name.trim();
    if (!clean) throw new CatalogError("El nombre de la categoría es obligatorio.");
    const now = runtime.clock.now();
    const sequence = input.sequence ?? 10;
    const existing = await repos.categories.findByName(clean);
    if (existing) {
      const reactivated = { ...existing, active: true, sequence, updatedAt: now, updatedBy: input.actorId };
      await repos.categories.update(reactivated);
      return reactivated;
    }
    const category: ProductCategory = {
      id: runtime.ids.next(), name: clean, active: true, sequence, createdAt: now, updatedAt: now, updatedBy: input.actorId,
    };
    await repos.categories.insert(category);
    return category;
  }

  async function updateProductCategory(input: { id: string; name: string; sequence: number; actorId: string }): Promise<ProductCategory> {
    const clean = input.name.trim();
    if (!clean) throw new CatalogError("El nombre de la categoría es obligatorio.");
    if (await repos.categories.existsByName(clean, input.id)) {
      throw new CatalogError("Ya existe otra categoría con ese nombre.");
    }
    const current = await repos.categories.findById(input.id);
    if (!current) throw new CatalogError("La categoría no existe.");
    const updated = { ...current, name: clean, sequence: input.sequence, updatedAt: runtime.clock.now(), updatedBy: input.actorId };
    await repos.categories.update(updated);
    return updated;
  }

  async function setProductCategoryActive(input: { id: string; active: boolean; actorId: string }): Promise<void> {
    if (!input.active && (await repos.categories.countActiveProducts(input.id)) > 0) {
      throw new CatalogError("No se puede archivar: hay productos activos dentro de esta categoría.");
    }
    const current = await repos.categories.findById(input.id);
    if (!current) throw new CatalogError("La categoría no existe.");
    await repos.categories.update({ ...current, active: input.active, updatedAt: runtime.clock.now(), updatedBy: input.actorId });
  }

  // ---- suppliers ----------------------------------------------------------------------------------------------

  async function ensureUniqueSupplier(name: string, taxId: string, excludeId: string | null): Promise<void> {
    if (await repos.suppliers.existsByName(name, excludeId)) throw new CatalogError("Ya existe otro proveedor con ese nombre.");
    if (taxId && (await repos.suppliers.existsByTaxId(taxId, excludeId))) {
      throw new CatalogError("Ya existe otro proveedor con ese CUIT.");
    }
  }

  async function createSupplier(input: SupplierInput): Promise<Supplier> {
    if (!input.name.trim()) throw new CatalogError("El nombre del proveedor es obligatorio.");
    const values = validateSupplierValues(input);
    const existing = await repos.suppliers.findByName(values.name);
    await ensureUniqueSupplier(values.name, values.taxId, existing?.id ?? null);
    const now = runtime.clock.now();
    if (existing) {
      const refreshed: Supplier = { ...existing, ...values, active: true, updatedAt: now, updatedBy: input.actorId };
      await repos.suppliers.update(refreshed);
      return refreshed;
    }
    const supplier: Supplier = {
      id: runtime.ids.next(), ...values, active: true, createdAt: now, updatedAt: now, updatedBy: input.actorId,
    };
    await repos.suppliers.insert(supplier);
    return supplier;
  }

  async function updateSupplier(input: SupplierInput & { id: string }): Promise<Supplier> {
    const values = validateSupplierValues(input);
    const current = await repos.suppliers.findById(input.id);
    if (!current) throw new CatalogError("El proveedor no existe.");
    await ensureUniqueSupplier(values.name, values.taxId, input.id);
    const updated: Supplier = { ...current, ...values, updatedAt: runtime.clock.now(), updatedBy: input.actorId };
    await repos.suppliers.update(updated);
    return updated;
  }

  async function setSupplierActive(input: { id: string; active: boolean; actorId: string }): Promise<void> {
    if (!input.active && (await repos.products.countActiveBySupplier(input.id)) > 0) {
      throw new CatalogError("No se puede archivar: hay productos activos que usan este proveedor.");
    }
    const current = await repos.suppliers.findById(input.id);
    if (!current) throw new CatalogError("El proveedor no existe.");
    await repos.suppliers.update({ ...current, active: input.active, updatedAt: runtime.clock.now(), updatedBy: input.actorId });
  }

  // ---- units and payment methods ------------------------------------------------------------------------------

  async function setReferenceActive(
    repo: { setActive(id: string, active: boolean): Promise<boolean> },
    id: string,
    active: boolean,
  ): Promise<void> {
    if (!(await repo.setActive(id, active))) throw new CatalogError("No se encontró el registro del catálogo.");
  }

  return {
    // products
    createProduct,
    updateProduct,
    getProduct: (id: string): Promise<Product | null> => repos.products.findById(id),
    listProducts: (options: { sellableOnly?: boolean; includeInactive?: boolean } = {}): Promise<Product[]> =>
      repos.products.list({ sellableOnly: options.sellableOnly ?? false, includeInactive: options.includeInactive ?? false }),
    async deactivateProduct(input: { id: string; actorId: string }): Promise<void> {
      await repos.products.setActive(input.id, false, runtime.clock.now(), input.actorId);
    },
    async restoreProduct(input: { id: string; actorId: string }): Promise<void> {
      await repos.products.setActive(input.id, true, runtime.clock.now(), input.actorId);
    },
    // product categories
    async listProductCategories(options: { activeOnly?: boolean } = {}): Promise<ModelOption[]> {
      return (await repos.categories.list({ activeOnly: options.activeOnly ?? true })).map((c) => option(c.id, c.name));
    },
    listProductCategoryRecords: (options: { activeOnly?: boolean } = {}): Promise<ProductCategoryRecord[]> =>
      repos.categories.list({ activeOnly: options.activeOnly ?? false }),
    getProductCategory,
    createProductCategory,
    updateProductCategory,
    setProductCategoryActive,
    // suppliers
    async listSuppliers(options: { activeOnly?: boolean } = {}): Promise<ModelOption[]> {
      return (await repos.suppliers.list({ activeOnly: options.activeOnly ?? true })).map((s) => option(s.id, s.name));
    },
    listSupplierRecords: (options: { activeOnly?: boolean } = {}): Promise<Supplier[]> =>
      repos.suppliers.list({ activeOnly: options.activeOnly ?? false }),
    getSupplier: (id: string): Promise<Supplier | null> => repos.suppliers.findById(id),
    createSupplier,
    updateSupplier,
    setSupplierActive,
    // units
    async listUnits(options: { activeOnly?: boolean } = {}): Promise<ModelOption[]> {
      return (await repos.units.list({ activeOnly: options.activeOnly ?? true })).map((u) => option(u.id, u.name, u.code));
    },
    async listUnitRecords(): Promise<Unit[]> {
      const units = await repos.units.list({ activeOnly: false });
      const rank = (u: Unit) => u.magnitude;
      return units.sort(
        (a, b) =>
          Number(b.active) - Number(a.active) ||
          (rank(a) < rank(b) ? -1 : rank(a) > rank(b) ? 1 : 0) ||
          a.baseFactor - b.baseFactor ||
          (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
          (a.code < b.code ? -1 : 1),
      );
    },
    setUnitActive: (input: { id: string; active: boolean }) => setReferenceActive(repos.units, input.id, input.active),
    // payment methods
    async listPaymentMethods(options: { activeOnly?: boolean } = {}): Promise<ModelOption[]> {
      return (await repos.paymentMethods.list({ activeOnly: options.activeOnly ?? true })).map((m) => option(m.id, m.name, m.code));
    },
    listPaymentMethodRecords: (): Promise<PaymentMethod[]> => repos.paymentMethods.list({ activeOnly: false }),
    setPaymentMethodActive: (input: { id: string; active: boolean }) =>
      setReferenceActive(repos.paymentMethods, input.id, input.active),
    /** Legacy `resolve_payment_method_id`: the active method whose display name matches (case-insensitive). */
    async resolveActivePaymentMethod(name: string): Promise<PaymentMethod> {
      const method = await repos.paymentMethods.findActiveByName(name.trim());
      if (!method) throw new CatalogError("El medio de pago no existe o está inactivo.");
      return method;
    },
    // movement categories (legacy `categorias`: Ingreso / Gasto / Compra)
    listMovementCategoryNames: (kind?: MovementCategoryKind): Promise<string[]> => repos.movementCategories.listNames(kind),
    findMovementCategory: (input: { name: string; kind?: MovementCategoryKind }): Promise<MovementCategory | null> =>
      repos.movementCategories.findActiveByName(input.name, input.kind),
  };
}

export type CatalogService = ReturnType<typeof createCatalogService>;
