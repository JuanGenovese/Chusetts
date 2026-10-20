import type { UnitOfWork } from "@/shared/application/unit-of-work";
import type {
  MovementCategory,
  MovementCategoryKind,
  PaymentMethod,
  Product,
  ProductCategory,
  ProductCategoryRecord,
  Supplier,
  Unit,
} from "../../domain";

/** Row to insert; the repository assigns `number` and, when `sku` is empty, the generated SKU. */
export type NewProduct = Omit<Product, "number" | "categoryName" | "stockUnitName" | "supplierName" | "sku"> & {
  sku: string;
};

export interface ProductRepository {
  findById(id: string): Promise<Product | null>;
  /** Legacy `get_productos`: ordered by active desc, category name, name. */
  list(filter: { sellableOnly: boolean; includeInactive: boolean }): Promise<Product[]>;
  /** Must throw CatalogError("Ya existe un producto con ese nombre.") / ("... con ese código.") on unique violations. */
  insert(product: NewProduct): Promise<Product>;
  /** Same unique-violation behaviour as insert. Returns false when the product does not exist. */
  update(product: Omit<NewProduct, "createdAt" | "active"> & { updatedAt: Date; updatedBy: string }): Promise<boolean>;
  setActive(id: string, active: boolean, at: Date, actorId: string): Promise<void>;
  countActiveBySupplier(supplierId: string): Promise<number>;
}

export interface ProductCategoryRepository {
  findById(id: string): Promise<ProductCategory | null>;
  /** Case-insensitive, any active state. */
  findByName(name: string): Promise<ProductCategory | null>;
  /** Case-insensitive duplicate check, ignoring `excludeId`. */
  existsByName(name: string, excludeId: string): Promise<boolean>;
  list(options: { activeOnly: boolean }): Promise<ProductCategoryRecord[]>;
  insert(category: ProductCategory): Promise<void>;
  update(category: ProductCategory): Promise<boolean>;
  countActiveProducts(categoryId: string): Promise<number>;
}

export interface SupplierRepository {
  findById(id: string): Promise<Supplier | null>;
  findByName(name: string): Promise<Supplier | null>;
  existsByName(name: string, excludeId: string | null): Promise<boolean>;
  existsByTaxId(taxId: string, excludeId: string | null): Promise<boolean>;
  list(options: { activeOnly: boolean }): Promise<Supplier[]>;
  insert(supplier: Supplier): Promise<void>;
  update(supplier: Supplier): Promise<boolean>;
}

export interface UnitRepository {
  findActiveByCode(code: string): Promise<Unit | null>;
  /** Legacy order: magnitude (unidad, volumen, other), base factor, name. */
  list(options: { activeOnly: boolean }): Promise<Unit[]>;
  setActive(id: string, active: boolean): Promise<boolean>;
}

export interface PaymentMethodRepository {
  /** Case-insensitive by display name. */
  findActiveByName(name: string): Promise<PaymentMethod | null>;
  /** Ordered by sequence, name. */
  list(options: { activeOnly: boolean }): Promise<PaymentMethod[]>;
  setActive(id: string, active: boolean): Promise<boolean>;
}

export interface MovementCategoryRepository {
  /** Active categories' names ordered by name, optionally of one kind. */
  listNames(kind?: MovementCategoryKind): Promise<string[]>;
  /** Active category by name (case-insensitive), optionally restricted to one kind. */
  findActiveByName(name: string, kind?: MovementCategoryKind): Promise<MovementCategory | null>;
}

/**
 * What the catalog needs from the inventory module (persisted state that lives there).
 * The composition root implements it with inventory's public transaction-scoped service on the SAME transaction.
 */
export interface CatalogInventoryCollaborator {
  /** Records the "Stock inicial" adjustment. Returns the stock-movement (ledger) id it was attached to. */
  recordInitialStock(input: { productId: string; quantity: number; actorId: string }): Promise<{ movementId: string }>;
  hasRecipe(productId: string): Promise<boolean>;
  setRecipeComponent(input: {
    saleProductId: string;
    componentId: string;
    quantity: number;
    unit: string | null;
    actorId: string;
  }): Promise<void>;
}

/** Persistence ports (implemented by the Drizzle adapters). */
export interface CatalogPersistence {
  products: ProductRepository;
  categories: ProductCategoryRepository;
  suppliers: SupplierRepository;
  units: UnitRepository;
  paymentMethods: PaymentMethodRepository;
  movementCategories: MovementCategoryRepository;
}

export interface CatalogRepositories extends CatalogPersistence {
  inventory: CatalogInventoryCollaborator;
}

export type CatalogUnitOfWork = UnitOfWork<CatalogRepositories>;
