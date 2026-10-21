import { randomUUID } from "node:crypto";
import { inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDbConnection, type DbConnection } from "@/shared/infrastructure/db/client";
import { drizzleUnitOfWork } from "@/shared/infrastructure/db/unit-of-work";
import { seedReferenceData } from "@/shared/infrastructure/db/seed-reference";
import { productCategories, products, suppliers, users } from "@/shared/infrastructure/db/schema";
import { catalogUseCases, type CatalogDeps, type CatalogInventoryCollaborator } from "../application";
import { createCatalogPersistence } from "./drizzle-catalog-repositories";
import { SystemClockForTests, UuidForTests } from "./test-runtime";

const url = process.env.DATABASE_URL;
if (!url) {
  console.warn("[integration] DATABASE_URL is not set: skipping catalog integration tests. Copy .env.local.example to .env.local, run `pnpm supabase:start && pnpm db:migrate`.");
}

/** Inventory is a different module; here only the catalog's own persistence is under test. */
const noInventory: CatalogInventoryCollaborator = {
  recordInitialStock: async () => ({ movementId: randomUUID() }),
  hasRecipe: async () => false,
  setRecipeComponent: async () => undefined,
};

describe.skipIf(!url)("catalog module against Postgres", () => {
  const tag = randomUUID().slice(0, 8);
  const n = (name: string) => `IT-${tag} ${name}`;
  let conn: DbConnection;
  let deps: CatalogDeps;
  let catalog: ReturnType<typeof catalogUseCases>;
  let actorId: string;

  beforeAll(async () => {
    conn = createDbConnection(url!, { max: 5 });
    actorId = randomUUID();
    await conn.db.insert(users).values({ id: actorId, username: `it-${actorId}`, displayName: "Integration", role: "admin" });
    await seedReferenceData(conn.db);
    deps = {
      uow: drizzleUnitOfWork(conn.db, (tx) => ({ ...createCatalogPersistence(tx), inventory: noInventory })),
      clock: new SystemClockForTests(),
      ids: new UuidForTests(),
    };
    catalog = catalogUseCases(deps);
  });

  afterAll(async () => {
    await conn.db.delete(products).where(like(products.name, `IT-${tag}%`));
    await conn.db.delete(suppliers).where(like(suppliers.name, `IT-${tag}%`));
    await conn.db.delete(productCategories).where(like(productCategories.name, `IT-${tag}%`));
    await conn.db.delete(users).where(inArray(users.id, [actorId]));
    await conn.close();
  });

  it("serves the seeded reference data in legacy order", async () => {
    expect((await catalog.listUnits()).map((u) => u.code)).toEqual(["unidad", "ml", "oz", "l", "g", "gr", "kg"]);
    expect((await catalog.listPaymentMethods()).map((m) => m.name)).toEqual(["Efectivo", "Transferencia", "Tarjeta", "Mercado Pago", "Otro"]);
    expect((await catalog.listPaymentMethods()).map((m) => m.name)).not.toContain("Nave");
    expect(await catalog.listMovementCategoryNames("Ingreso")).toEqual(["Delivery", "Venta evento", "Venta mostrador"]);
    expect((await catalog.listMovementCategoryNames()).length).toBeGreaterThanOrEqual(15);
    expect((await catalog.resolveActivePaymentMethod("mercado pago")).code).toBe("MERCADO_PAGO");
  });

  it("creates a product with relational category/supplier/unit and a generated SKU", async () => {
    const category = await catalog.createProductCategory({ name: n("Tragos"), actorId });
    const supplier = await catalog.createSupplier({ name: n("Distribuidora"), business: "Bebidas", taxId: `30-${tag.replace(/\D/g, "1")}-9`, actorId });
    const { product } = await catalog.createProduct({
      name: n("Fernet"), categoryId: category.id, isSellable: false, isSupply: true, unitCost: 1_000_000, minStock: 100,
      stockUnit: "ml", purchaseUnit: "botella", purchaseFactor: 750, supplierId: supplier.id, actorId,
    });
    expect(product).toMatchObject({
      categoryName: n("Tragos"), supplierName: n("Distribuidora"), stockUnit: "ml", stockUnitName: "Mililitro",
      purchaseFactor: 750, unitCost: 1_000_000, minStock: 100, updatedBy: actorId, active: true,
    });
    expect(product.sku).toMatch(/^P-\d{4,}$/);
    expect(product.sku).toBe(`P-${String(product.number).padStart(4, "0")}`);
    expect(await catalog.getProduct(product.id)).toEqual(product);
  });

  it("maps unique violations to the Spanish messages, keeps the failed insert out", async () => {
    const make = (name: string, sku = "") => catalog.createProduct({ name, categoryName: n("General2"), sku, actorId });
    await make(n("Pinta"), n("SKU-1"));
    await expect(make(n("Pinta"))).rejects.toThrow("Ya existe un producto con ese nombre.");
    await expect(make(n("Otra"), n("SKU-1"))).rejects.toThrow("Ya existe un producto con ese código.");
    expect((await catalog.listProducts()).filter((p) => p.name === n("Otra"))).toHaveLength(0);
  });

  it("filters, orders and soft-deletes products", async () => {
    const cat = n("Orden");
    const make = (name: string, isSellable = true) => catalog.createProduct({ name: n(name), categoryName: cat, isSellable, actorId });
    await make("Zeta");
    await make("Alfa");
    const { product: supply } = await make("Hielo", false);
    const mine = (list: { name: string; categoryName: string }[]) =>
      list.filter((p) => p.categoryName === cat).map((p) => p.name.replace(`IT-${tag} `, ""));
    expect(mine(await catalog.listProducts())).toEqual(["Alfa", "Hielo", "Zeta"]);
    expect(mine(await catalog.listProducts({ sellableOnly: true }))).toEqual(["Alfa", "Zeta"]);
    await catalog.deactivateProduct({ id: supply.id, actorId });
    expect(mine(await catalog.listProducts())).toEqual(["Alfa", "Zeta"]);
    expect(mine(await catalog.listProducts({ includeInactive: true }))).toEqual(["Alfa", "Zeta", "Hielo"]);
    await catalog.restoreProduct({ id: supply.id, actorId: actorId });
    expect((await catalog.getProduct(supply.id))?.active).toBe(true);
  });

  it("updates a product and rejects a rename onto an existing one", async () => {
    const { product } = await catalog.createProduct({ name: n("Editable"), categoryName: n("Orden"), salePrice: 350_000, actorId });
    await catalog.createProduct({ name: n("Ocupado"), categoryName: n("Orden"), actorId });
    const edit = (over: object = {}) =>
      catalog.updateProduct({
        id: product.id, name: n("Editable"), categoryName: n("Orden"), isSellable: true, controlsStock: true,
        stockUnit: "unidad", salePrice: 400_000, unitCost: 0, minStock: 0, actorId, ...over,
      });
    expect(await edit({ description: "rubia" })).toMatchObject({ salePrice: 400_000, description: "rubia", sku: product.sku });
    await expect(edit({ name: n("Ocupado") })).rejects.toThrow("Ya existe un producto con ese nombre.");
    await expect(catalog.updateProduct({ id: randomUUID(), name: "x", categoryName: n("Orden"), isSellable: true, controlsStock: true, stockUnit: "unidad", salePrice: 0, unitCost: 0, minStock: 0, actorId })).rejects.toThrow("El producto no existe.");
  });

  it("category rename, archive protection and counts", async () => {
    const category = await catalog.createProductCategory({ name: n("Cervezas"), sequence: 7, actorId });
    expect((await catalog.createProductCategory({ name: n("cervezas"), sequence: 7, actorId })).id).toBe(category.id);
    await catalog.createProduct({ name: n("Pinta cat"), categoryId: category.id, actorId });
    await catalog.updateProductCategory({ id: category.id, name: n("Cervezas artesanales"), sequence: 5, actorId });
    expect(await catalog.getProductCategory(category.id)).toMatchObject({ name: n("Cervezas artesanales"), sequence: 5, assignedProducts: 1 });
    await expect(catalog.setProductCategoryActive({ id: category.id, active: false, actorId })).rejects.toThrow(
      "No se puede archivar: hay productos activos dentro de esta categoría.",
    );
    const other = await catalog.createProductCategory({ name: n("Vacía"), actorId });
    await catalog.setProductCategoryActive({ id: other.id, active: false, actorId });
    expect((await catalog.listProductCategories()).map((c) => c.id)).not.toContain(other.id);
    await expect(catalog.updateProductCategory({ id: other.id, name: n("CERVEZAS ARTESANALES"), sequence: 1, actorId })).rejects.toThrow(
      "Ya existe otra categoría con ese nombre.",
    );
  });

  it("supplier master data: uniqueness, reactivation and archive protection", async () => {
    const taxId = `30-${tag.replace(/\D/g, "2")}0-1`;
    const supplier = await catalog.createSupplier({ name: n("Proveedor A"), taxId, email: "A@B.test", actorId });
    expect(supplier.email).toBe("a@b.test");
    await expect(catalog.createSupplier({ name: n("Proveedor B"), taxId, actorId })).rejects.toThrow("Ya existe otro proveedor con ese CUIT.");
    // Two suppliers with NO tax id are fine.
    await catalog.createSupplier({ name: n("Sin CUIT 1"), actorId });
    await catalog.createSupplier({ name: n("Sin CUIT 2"), actorId });
    await expect(catalog.updateSupplier({ id: supplier.id, name: n("sin cuit 1"), actorId })).rejects.toThrow("Ya existe otro proveedor con ese nombre.");
    await catalog.createProduct({ name: n("Con proveedor"), categoryName: n("Orden"), supplierId: supplier.id, actorId });
    await expect(catalog.setSupplierActive({ id: supplier.id, active: false, actorId })).rejects.toThrow(
      "No se puede archivar: hay productos activos que usan este proveedor.",
    );
    const free = await catalog.createSupplier({ name: n("Libre"), actorId });
    await catalog.setSupplierActive({ id: free.id, active: false, actorId });
    expect((await catalog.listSuppliers()).map((s) => s.id)).not.toContain(free.id);
    const again = await catalog.createSupplier({ name: n("LIBRE"), contact: "Nuevo", actorId });
    expect(again).toMatchObject({ id: free.id, active: true, contact: "Nuevo" });
  });
});
