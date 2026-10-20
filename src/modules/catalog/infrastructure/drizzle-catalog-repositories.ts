import { and, asc, desc, eq, getTableColumns, ne, sql, type SQL } from "drizzle-orm";
import type { DbExecutor } from "@/shared/infrastructure/db/client";
import { PG_UNIQUE_VIOLATION, pgErrorInfo } from "@/shared/infrastructure/db/errors";
import {
  movementCategories,
  paymentMethods,
  productCategories,
  products,
  suppliers,
  units,
} from "@/shared/infrastructure/db/schema";
import {
  CatalogError,
  defaultSku,
  type PaymentMethod,
  type Product,
  type ProductCategory,
  type Supplier,
  type Unit,
} from "../domain";
import type {
  CatalogPersistence,
  MovementCategoryRepository,
  NewProduct,
  PaymentMethodRepository,
  ProductCategoryRepository,
  ProductRepository,
  SupplierRepository,
  UnitRepository,
} from "../application/ports";

// Legacy (SQLite) compared strings bytewise; "C" collation keeps that ordering independent of the server locale.
const byText = (column: Parameters<typeof sql>[1]) => sql`${column} collate "C"`;
const lowerEq = (column: Parameters<typeof sql>[1], value: string) => sql`lower(${column}) = lower(${value})`;

const productColumns = {
  id: products.id,
  number: products.number,
  name: products.name,
  sku: products.sku,
  description: products.description,
  categoryId: products.categoryId,
  categoryName: productCategories.name,
  salePrice: products.salePrice,
  unitCost: products.unitCost,
  minStock: products.minStock,
  active: products.active,
  isSellable: products.isSellable,
  isPurchasable: products.isPurchasable,
  isSupply: products.isSupply,
  isCompound: products.isCompound,
  controlsStock: products.controlsStock,
  stockUnit: products.stockUnit,
  stockUnitId: products.stockUnitId,
  stockUnitName: units.name,
  purchaseUnit: products.purchaseUnit,
  purchaseFactor: products.purchaseFactor,
  supplierId: products.supplierId,
  supplierName: suppliers.name,
  createdAt: products.createdAt,
  updatedAt: products.updatedAt,
  updatedBy: products.updatedBy,
};

function translateProductError(error: unknown): never {
  const { code, constraint } = pgErrorInfo(error);
  if (code === PG_UNIQUE_VIOLATION && constraint === "products_name_unique") {
    throw new CatalogError("Ya existe un producto con ese nombre.");
  }
  if (code === PG_UNIQUE_VIOLATION && constraint === "products_sku_unique") {
    throw new CatalogError("Ya existe un producto con ese código.");
  }
  throw error;
}

class DrizzleProductRepository implements ProductRepository {
  constructor(private readonly db: DbExecutor) {}

  private select() {
    return this.db
      .select(productColumns)
      .from(products)
      .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
      .innerJoin(units, eq(units.id, products.stockUnitId))
      .leftJoin(suppliers, eq(suppliers.id, products.supplierId));
  }

  async findById(id: string): Promise<Product | null> {
    const [row] = await this.select().where(eq(products.id, id)).limit(1);
    return row ?? null;
  }

  async list({ sellableOnly, includeInactive }: { sellableOnly: boolean; includeInactive: boolean }) {
    const filters: SQL[] = [];
    if (!includeInactive) filters.push(eq(products.active, true));
    if (sellableOnly) filters.push(eq(products.isSellable, true));
    return this.select()
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(products.active), asc(byText(productCategories.name)), asc(byText(products.name)));
  }

  async insert(product: NewProduct): Promise<Product> {
    try {
      const [row] = await this.db
        .insert(products)
        // A transient unique placeholder is replaced right below when no SKU was typed (needs the generated number).
        .values({ ...product, sku: product.sku || `pending-${product.id}` })
        .returning({ number: products.number });
      if (!product.sku) {
        await this.db.update(products).set({ sku: defaultSku(row.number) }).where(eq(products.id, product.id));
      }
    } catch (error) {
      translateProductError(error);
    }
    return (await this.findById(product.id))!;
  }

  async update(product: Parameters<ProductRepository["update"]>[0]): Promise<boolean> {
    const { id, sku, ...rest } = product;
    try {
      const rows = await this.db
        .update(products)
        // An empty SKU keeps the current one (never leave a product without a code).
        .set({ ...rest, ...(sku ? { sku } : {}) })
        .where(eq(products.id, id))
        .returning({ id: products.id });
      return rows.length > 0;
    } catch (error) {
      return translateProductError(error);
    }
  }

  async setActive(id: string, active: boolean, at: Date, actorId: string): Promise<void> {
    await this.db
      .update(products)
      .set({ active, updatedAt: at, updatedBy: actorId })
      .where(and(eq(products.id, id), eq(products.active, !active)));
  }

  async countActiveBySupplier(supplierId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(products)
      .where(and(eq(products.supplierId, supplierId), eq(products.active, true)));
    return row.n;
  }
}

class DrizzleProductCategoryRepository implements ProductCategoryRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(id: string): Promise<ProductCategory | null> {
    const [row] = await this.db.select().from(productCategories).where(eq(productCategories.id, id)).limit(1);
    return row ?? null;
  }

  async findByName(name: string): Promise<ProductCategory | null> {
    const [row] = await this.db.select().from(productCategories).where(lowerEq(productCategories.name, name)).limit(1);
    return row ?? null;
  }

  async existsByName(name: string, excludeId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: productCategories.id })
      .from(productCategories)
      .where(and(lowerEq(productCategories.name, name), ne(productCategories.id, excludeId)))
      .limit(1);
    return rows.length > 0;
  }

  async list({ activeOnly }: { activeOnly: boolean }) {
    return this.db
      .select({
        ...getTableColumns(productCategories),
        assignedProducts: sql<number>`(select count(*)::int from ${products} where ${products.categoryId} = ${productCategories.id} and ${products.active})`,
      })
      .from(productCategories)
      .where(activeOnly ? eq(productCategories.active, true) : undefined)
      .orderBy(desc(productCategories.active), asc(productCategories.sequence), asc(byText(productCategories.name)));
  }

  async insert(category: ProductCategory): Promise<void> {
    await this.db.insert(productCategories).values(category);
  }

  async update(category: ProductCategory): Promise<boolean> {
    const { id, ...values } = category;
    const rows = await this.db.update(productCategories).set(values).where(eq(productCategories.id, id)).returning({ id: productCategories.id });
    return rows.length > 0;
  }

  async countActiveProducts(categoryId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(products)
      .where(and(eq(products.categoryId, categoryId), eq(products.active, true)));
    return row.n;
  }
}

class DrizzleSupplierRepository implements SupplierRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(id: string): Promise<Supplier | null> {
    const [row] = await this.db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
    return row ?? null;
  }

  async findByName(name: string): Promise<Supplier | null> {
    const [row] = await this.db.select().from(suppliers).where(lowerEq(suppliers.name, name)).limit(1);
    return row ?? null;
  }

  async existsByName(name: string, excludeId: string | null): Promise<boolean> {
    const rows = await this.db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(lowerEq(suppliers.name, name), excludeId ? ne(suppliers.id, excludeId) : undefined))
      .limit(1);
    return rows.length > 0;
  }

  async existsByTaxId(taxId: string, excludeId: string | null): Promise<boolean> {
    const rows = await this.db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(eq(suppliers.taxId, taxId), excludeId ? ne(suppliers.id, excludeId) : undefined))
      .limit(1);
    return rows.length > 0;
  }

  async list({ activeOnly }: { activeOnly: boolean }) {
    return this.db
      .select()
      .from(suppliers)
      .where(activeOnly ? eq(suppliers.active, true) : undefined)
      .orderBy(desc(suppliers.active), asc(byText(suppliers.name)));
  }

  async insert(supplier: Supplier): Promise<void> {
    await this.db.insert(suppliers).values(supplier);
  }

  async update(supplier: Supplier): Promise<boolean> {
    const { id, ...values } = supplier;
    const rows = await this.db.update(suppliers).set(values).where(eq(suppliers.id, id)).returning({ id: suppliers.id });
    return rows.length > 0;
  }
}

class DrizzleUnitRepository implements UnitRepository {
  constructor(private readonly db: DbExecutor) {}

  async findActiveByCode(code: string): Promise<Unit | null> {
    const [row] = await this.db.select().from(units).where(and(eq(units.code, code), eq(units.active, true))).limit(1);
    return row ?? null;
  }

  async list({ activeOnly }: { activeOnly: boolean }) {
    return this.db
      .select()
      .from(units)
      .where(activeOnly ? eq(units.active, true) : undefined)
      .orderBy(
        sql`case ${units.magnitude} when 'unidad' then 1 when 'volumen' then 2 else 3 end`,
        asc(units.baseFactor),
        asc(byText(units.name)),
        asc(byText(units.code)),
      );
  }

  async setActive(id: string, active: boolean): Promise<boolean> {
    const rows = await this.db.update(units).set({ active }).where(eq(units.id, id)).returning({ id: units.id });
    return rows.length > 0;
  }
}

class DrizzlePaymentMethodRepository implements PaymentMethodRepository {
  constructor(private readonly db: DbExecutor) {}

  async findActiveByName(name: string): Promise<PaymentMethod | null> {
    const [row] = await this.db
      .select()
      .from(paymentMethods)
      .where(and(lowerEq(paymentMethods.name, name), eq(paymentMethods.active, true)))
      .limit(1);
    return row ?? null;
  }

  async list({ activeOnly }: { activeOnly: boolean }) {
    return this.db
      .select()
      .from(paymentMethods)
      .where(activeOnly ? eq(paymentMethods.active, true) : undefined)
      .orderBy(desc(paymentMethods.active), asc(paymentMethods.sequence), asc(byText(paymentMethods.name)));
  }

  async setActive(id: string, active: boolean): Promise<boolean> {
    const rows = await this.db.update(paymentMethods).set({ active }).where(eq(paymentMethods.id, id)).returning({ id: paymentMethods.id });
    return rows.length > 0;
  }
}

class DrizzleMovementCategoryRepository implements MovementCategoryRepository {
  constructor(private readonly db: DbExecutor) {}

  async listNames(kind?: "Ingreso" | "Gasto" | "Compra"): Promise<string[]> {
    const rows = await this.db
      .select({ name: movementCategories.name })
      .from(movementCategories)
      .where(and(eq(movementCategories.active, true), kind ? eq(movementCategories.kind, kind) : undefined))
      .orderBy(asc(byText(movementCategories.name)));
    return rows.map((r) => r.name);
  }

  async findActiveByName(name: string, kind?: "Ingreso" | "Gasto" | "Compra") {
    const [row] = await this.db
      .select()
      .from(movementCategories)
      .where(and(eq(movementCategories.active, true), lowerEq(movementCategories.name, name.trim()), kind ? eq(movementCategories.kind, kind) : undefined))
      .limit(1);
    return row ?? null;
  }
}

/** Persistence adapters bound to one executor (a transaction inside a unit of work). */
export function createCatalogPersistence(db: DbExecutor): CatalogPersistence {
  return {
    products: new DrizzleProductRepository(db),
    categories: new DrizzleProductCategoryRepository(db),
    suppliers: new DrizzleSupplierRepository(db),
    units: new DrizzleUnitRepository(db),
    paymentMethods: new DrizzlePaymentMethodRepository(db),
    movementCategories: new DrizzleMovementCategoryRepository(db),
  };
}
