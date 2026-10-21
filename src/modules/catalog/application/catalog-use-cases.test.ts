import { beforeEach, describe, expect, it } from "vitest";
import { CatalogError } from "../domain";
import { makeCatalogTestDeps } from "./testing/in-memory";
import { catalogUseCases } from "./index";

let t: ReturnType<typeof makeCatalogTestDeps>;
let catalog: ReturnType<typeof catalogUseCases>;
const ADMIN = "admin-1";

beforeEach(() => {
  t = makeCatalogTestDeps();
  catalog = catalogUseCases(t.deps);
});

const pesos = (n: number) => n * 100;

describe("seeded reference data (test fixture mirrors the seed)", () => {
  it("exposes the legacy units, payment methods and movement categories", async () => {
    expect((await catalog.listUnits()).map((u) => u.code)).toEqual(["unidad", "ml", "oz", "l", "g", "gr", "kg"]);
    expect((await catalog.listPaymentMethods()).map((m) => m.name)).toEqual([
      "Efectivo", "Transferencia", "Tarjeta", "Mercado Pago", "Otro",
    ]);
    expect(await catalog.listMovementCategoryNames("Compra")).toEqual([
      "Compra bebida", "Compra cerveza", "Compra comida", "Compra insumos",
    ]);
    expect((await catalog.listMovementCategoryNames()).length).toBe(15);
  });
});

describe("findMovementCategory", () => {
  it("finds an active category by name (case-insensitive), optionally of one kind", async () => {
    expect(await catalog.findMovementCategory({ name: "compra cerveza", kind: "Compra" })).toMatchObject({ name: "Compra cerveza", kind: "Compra" });
    expect(await catalog.findMovementCategory({ name: "Compra cerveza", kind: "Gasto" })).toBeNull();
    expect(await catalog.findMovementCategory({ name: "Sin categoría" })).toBeNull();
  });
});

describe("createProduct", () => {
  it("uses relational category, supplier and unit and generates the SKU", async () => {
    const category = await catalog.createProductCategory({ name: "Tragos", actorId: ADMIN });
    const supplier = await catalog.createSupplier({ name: "Distribuidora Norte", business: "Bebidas", contact: "Contacto", actorId: ADMIN });
    const { product } = await catalog.createProduct({
      name: " Fernet modelo ",
      categoryId: category.id,
      isSellable: false,
      controlsStock: true,
      salePrice: 0,
      unitCost: pesos(10_000),
      minStock: 100,
      stockUnit: "ml",
      isPurchasable: true,
      isSupply: true,
      purchaseUnit: "botella",
      purchaseFactor: 750,
      supplierId: supplier.id,
      actorId: ADMIN,
    });
    expect(product).toMatchObject({
      name: "Fernet modelo",
      sku: "P-0001",
      categoryId: category.id,
      categoryName: "Tragos",
      supplierId: supplier.id,
      supplierName: "Distribuidora Norte",
      stockUnit: "ml",
      stockUnitName: "Mililitro",
      purchaseUnit: "botella",
      purchaseFactor: 750,
      unitCost: 1_000_000,
      active: true,
      isSupply: true,
      updatedBy: ADMIN,
    });
    expect(await catalog.getProduct(product.id)).toEqual(product);
  });

  it("keeps a custom SKU and rejects duplicate names and codes", async () => {
    const make = (name: string, sku = "") =>
      catalog.createProduct({ name, categoryName: "General", sku, actorId: ADMIN });
    const { product } = await make("Pinta", "  PIN-1 ");
    expect(product.sku).toBe("PIN-1");
    await expect(make("Pinta")).rejects.toThrow("Ya existe un producto con ese nombre.");
    await expect(make("Otra", "PIN-1")).rejects.toThrow("Ya existe un producto con ese código.");
  });

  it("resolves the category by name, creating it when missing and reusing it case-insensitively", async () => {
    const a = await catalog.createProduct({ name: "A", categoryName: "Cervezas", actorId: ADMIN });
    const b = await catalog.createProduct({ name: "B", categoryName: "cervezas", actorId: ADMIN });
    expect(b.product.categoryId).toBe(a.product.categoryId);
    expect(b.product.categoryName).toBe("Cervezas");
    const records = await catalog.listProductCategoryRecords();
    expect(records.find((r) => r.name === "Cervezas")).toMatchObject({ sequence: 10, active: true, assignedProducts: 2 });
  });

  it("validates the category", async () => {
    await expect(catalog.createProduct({ name: "A", categoryName: "  ", actorId: ADMIN })).rejects.toThrow(
      "La categoría es obligatoria.",
    );
    const archived = await catalog.createProductCategory({ name: "Vieja", actorId: ADMIN });
    await catalog.setProductCategoryActive({ id: archived.id, active: false, actorId: ADMIN });
    await expect(catalog.createProduct({ name: "A", categoryId: archived.id, actorId: ADMIN })).rejects.toThrow(
      "La categoría seleccionada no existe o está inactiva.",
    );
    await expect(catalog.createProduct({ name: "A", categoryId: "nope", actorId: ADMIN })).rejects.toThrow(
      "La categoría seleccionada no existe o está inactiva.",
    );
  });

  it("rejects an inactive unit", async () => {
    const units = await catalog.listUnitRecords();
    const mlUnit = units.find((u) => u.code === "ml")!;
    await catalog.setUnitActive({ id: mlUnit.id, active: false });
    await expect(
      catalog.createProduct({ name: "A", categoryName: "General", stockUnit: "ml", actorId: ADMIN }),
    ).rejects.toThrow("La unidad de medida seleccionada no existe o está inactiva.");
  });

  it("applies the domain validations before touching anything", async () => {
    const bad = (over: object) => catalog.createProduct({ name: "A", categoryName: "General", actorId: ADMIN, ...over });
    await expect(bad({ name: " " })).rejects.toThrow(CatalogError);
    await expect(bad({ stockUnit: "oz" })).rejects.toThrow("Unidad no compatible. Usá unidad, ml, l, g o kg.");
    await expect(bad({ initialStock: -1 })).rejects.toThrow("El stock no puede ser negativo.");
    await expect(bad({ controlsStock: false, initialStock: 2 })).rejects.toThrow(
      "Un producto sin stock propio no puede tener stock inicial.",
    );
    expect(t.store.products.size).toBe(0);
    expect(t.store.categories.size).toBe(1); // only the seeded "General"
  });

  it("records the initial stock through inventory and reports the stock movement", async () => {
    const { product, initialStock } = await catalog.createProduct({
      name: "Agua", categoryName: "General", initialStock: 12, minStock: 2, actorId: ADMIN,
    });
    expect(t.inventory.initialStock).toEqual([{ productId: product.id, quantity: 12, actorId: ADMIN }]);
    expect(initialStock).toEqual({ movementId: "stock-movement-1", quantity: 12 });
    const none = await catalog.createProduct({ name: "Soda", categoryName: "General", actorId: ADMIN });
    expect(none.initialStock).toBeNull();
    expect(t.inventory.initialStock).toHaveLength(1);
  });

  it("creates a compound product with its recipe components atomically (Insumo 1/2/N)", async () => {
    const fernet = (await catalog.createProduct({ name: "Fernet", categoryName: "General", isSupply: true, isSellable: false, stockUnit: "ml", actorId: ADMIN })).product;
    const coca = (await catalog.createProduct({ name: "Coca", categoryName: "General", isSupply: true, isSellable: false, stockUnit: "ml", actorId: ADMIN })).product;
    const { product } = await catalog.createProduct({
      name: "Fernet con coca",
      categoryName: "General",
      salePrice: pesos(5000),
      recipe: [
        { componentId: fernet.id, quantity: 70, unit: "ml" },
        { componentId: coca.id, quantity: 230, unit: "ml" },
      ],
      actorId: ADMIN,
    });
    expect(product).toMatchObject({ isCompound: true, controlsStock: false, salePrice: 500_000 });
    expect(t.inventory.recipes.map((r) => [r.saleProductId, r.componentId, r.quantity, r.unit])).toEqual([
      [product.id, fernet.id, 70, "ml"],
      [product.id, coca.id, 230, "ml"],
    ]);
  });

  it("rolls the whole creation back when a recipe component is invalid", async () => {
    t.inventory.failOnRecipe = new Error("Unidad no compatible. Usá unidad, ml, l, g o kg.");
    await expect(
      catalog.createProduct({
        name: "Roto", categoryName: "General", actorId: ADMIN,
        recipe: [{ componentId: "x", quantity: 1, unit: "oz" }],
      }),
    ).rejects.toThrow("Unidad no compatible");
    expect(t.store.products.size).toBe(0);
  });
});

describe("updateProduct", () => {
  async function seed() {
    const { product } = await catalog.createProduct({
      name: "Pinta", categoryName: "Cervezas", isSellable: true, salePrice: pesos(3500), unitCost: pesos(1200),
      initialStock: 10, minStock: 2, actorId: ADMIN,
    });
    return product;
  }
  const edit = (id: string, over: object = {}) =>
    catalog.updateProduct({
      id, name: "Pinta", categoryName: "Cervezas", isSellable: true, controlsStock: true, stockUnit: "unidad",
      salePrice: pesos(4000), unitCost: pesos(1200), minStock: 2, actorId: "supervisor", ...over,
    });

  it("updates the fields and stamps who changed it", async () => {
    const p = await seed();
    const updated = await edit(p.id, { name: " Pinta IPA ", description: " rubia ", sku: "IPA-1" });
    expect(updated).toMatchObject({
      name: "Pinta IPA", description: "rubia", sku: "IPA-1", salePrice: 400_000, updatedBy: "supervisor",
    });
  });

  it("an empty SKU on update keeps the current code (the legacy wrote NULL; we never leave a product without code)", async () => {
    const p = await seed();
    const updated = await edit(p.id, { sku: "" });
    expect(updated.sku).toBe(p.sku); // never leaves a product without code
  });

  it("forces compound + no stock control when the product has a recipe", async () => {
    const p = await seed();
    t.inventory.recipes.push({ saleProductId: p.id, componentId: "c", quantity: 1, unit: "unidad" });
    const updated = await edit(p.id, { controlsStock: true, isCompound: false });
    expect(updated).toMatchObject({ isCompound: true, controlsStock: false });
  });

  it("flagging a product as compound drops stock control", async () => {
    const p = await seed();
    expect(await edit(p.id, { isCompound: true })).toMatchObject({ isCompound: true, controlsStock: false });
  });

  it("validates and reports a missing product", async () => {
    const p = await seed();
    await expect(edit(p.id, { name: " " })).rejects.toThrow("El nombre es obligatorio.");
    await expect(edit(p.id, { minStock: -1 })).rejects.toThrow("El stock mínimo no puede ser negativo.");
    await expect(edit(p.id, { purchaseFactor: 0 })).rejects.toThrow("La conversión de compra a stock debe ser mayor que cero.");
    await expect(edit("nope")).rejects.toThrow("El producto no existe.");
  });

  it("does not allow renaming onto an existing product", async () => {
    const p = await seed();
    await catalog.createProduct({ name: "Otra", categoryName: "General", actorId: ADMIN });
    await expect(edit(p.id, { name: "Otra" })).rejects.toThrow("Ya existe un producto con ese nombre.");
  });
});

describe("listing, soft delete and restore", () => {
  beforeEach(async () => {
    const make = (name: string, categoryName: string, isSellable = true) =>
      catalog.createProduct({ name, categoryName, isSellable, isSupply: !isSellable, actorId: ADMIN });
    await make("Zeta", "Bebidas");
    await make("Alfa", "Bebidas");
    await make("Hielo", "Insumos", false);
    await make("Vaso", "Comida");
  });

  it("lists active products ordered by category then name", async () => {
    expect((await catalog.listProducts()).map((p) => p.name)).toEqual(["Alfa", "Zeta", "Vaso", "Hielo"]);
  });

  it("sellableOnly filters out supplies", async () => {
    expect((await catalog.listProducts({ sellableOnly: true })).map((p) => p.name)).toEqual(["Alfa", "Zeta", "Vaso"]);
  });

  it("soft delete hides the product unless inactive ones are included, and restore brings it back", async () => {
    const vaso = (await catalog.listProducts()).find((p) => p.name === "Vaso")!;
    await catalog.deactivateProduct({ id: vaso.id, actorId: ADMIN });
    expect((await catalog.listProducts()).map((p) => p.name)).not.toContain("Vaso");
    const all = await catalog.listProducts({ includeInactive: true });
    expect(all.map((p) => p.name)).toEqual(["Alfa", "Zeta", "Hielo", "Vaso"]); // active first
    expect(all.at(-1)).toMatchObject({ active: false, updatedBy: ADMIN });
    await catalog.restoreProduct({ id: vaso.id, actorId: "other" });
    expect((await catalog.getProduct(vaso.id))).toMatchObject({ active: true, updatedBy: "other" });
  });

  it("deactivating an unknown or already inactive product is a silent no-op (legacy)", async () => {
    await expect(catalog.deactivateProduct({ id: "nope", actorId: ADMIN })).resolves.toBeUndefined();
    await expect(catalog.restoreProduct({ id: "nope", actorId: ADMIN })).resolves.toBeUndefined();
  });

  it("getProduct returns null for unknown ids", async () => {
    expect(await catalog.getProduct("nope")).toBeNull();
  });
});

describe("product categories", () => {
  it("creating an existing name (any case) reuses and reactivates it", async () => {
    const first = await catalog.createProductCategory({ name: "Tragos", actorId: ADMIN });
    const again = await catalog.createProductCategory({ name: " tragos ", sequence: 3, actorId: "x" });
    expect(again.id).toBe(first.id);
    expect(again).toMatchObject({ name: "Tragos", sequence: 3, active: true });
    await expect(catalog.createProductCategory({ name: "  ", actorId: ADMIN })).rejects.toThrow(
      "El nombre de la categoría es obligatorio.",
    );
  });

  it("rename and archive rules; renaming shows up on the products", async () => {
    const category = await catalog.createProductCategory({ name: "Cervezas especiales", actorId: ADMIN });
    const { product } = await catalog.createProduct({
      name: "Pinta de prueba", categoryId: category.id, isSellable: true, salePrice: pesos(3500),
      unitCost: pesos(1200), initialStock: 10, minStock: 2, actorId: ADMIN,
    });
    await catalog.updateProductCategory({ id: category.id, name: "Cervezas artesanales", sequence: 5, actorId: ADMIN });
    expect(await catalog.getProductCategory(category.id)).toMatchObject({
      name: "Cervezas artesanales", sequence: 5, assignedProducts: 1,
    });
    expect((await catalog.getProduct(product.id))?.categoryName).toBe("Cervezas artesanales");
    await expect(
      catalog.setProductCategoryActive({ id: category.id, active: false, actorId: ADMIN }),
    ).rejects.toThrow("No se puede archivar: hay productos activos dentro de esta categoría.");
    expect((await catalog.listProductCategories()).map((c) => c.id)).toContain(category.id);
  });

  it("validates rename and archive of unknown / duplicate categories", async () => {
    const a = await catalog.createProductCategory({ name: "A", actorId: ADMIN });
    await catalog.createProductCategory({ name: "B", actorId: ADMIN });
    await expect(catalog.updateProductCategory({ id: a.id, name: "b", sequence: 1, actorId: ADMIN })).rejects.toThrow(
      "Ya existe otra categoría con ese nombre.",
    );
    await expect(catalog.updateProductCategory({ id: a.id, name: " ", sequence: 1, actorId: ADMIN })).rejects.toThrow(
      "El nombre de la categoría es obligatorio.",
    );
    await expect(catalog.updateProductCategory({ id: "nope", name: "Z", sequence: 1, actorId: ADMIN })).rejects.toThrow(
      "La categoría no existe.",
    );
    await expect(catalog.setProductCategoryActive({ id: "nope", active: true, actorId: ADMIN })).rejects.toThrow(
      "La categoría no existe.",
    );
    await catalog.setProductCategoryActive({ id: a.id, active: false, actorId: ADMIN });
    expect((await catalog.listProductCategories()).map((c) => c.name)).not.toContain("A");
    expect((await catalog.listProductCategoryRecords({ activeOnly: false })).map((c) => c.name)).toContain("A");
  });

  it("orders by sequence then name", async () => {
    await catalog.createProductCategory({ name: "Zeta", sequence: 1, actorId: ADMIN });
    await catalog.createProductCategory({ name: "Alfa", sequence: 20, actorId: ADMIN });
    expect((await catalog.listProductCategories()).map((c) => c.name)).toEqual(["Zeta", "General", "Alfa"]);
  });
});

describe("suppliers", () => {
  const full = {
    name: "Distribuidora Centro", business: "Bebidas", contact: "Lucía", legalName: "Distribuidora Centro SA",
    taxId: "30-12345678-9", phone: "351-555-0101", email: "ventas@centro.test", address: "Av. Central 123",
    notes: "Entrega los martes",
  };

  it("has an editable master record with audit fields", async () => {
    const supplier = await catalog.createSupplier({ ...full, actorId: "admin" });
    expect(await catalog.getSupplier(supplier.id)).toMatchObject({ legalName: "Distribuidora Centro SA", taxId: "30-12345678-9", updatedBy: "admin" });
    const updated = await catalog.updateSupplier({
      id: supplier.id, name: "Distribuidora Centro", legalName: "Centro SA", taxId: "30-12345678-9", business: "Bebidas",
      contact: "Martín", phone: "351-555-0202", email: "compras@centro.test", address: "Av. Central 456",
      notes: "Entrega semanal", actorId: "supervisor",
    });
    expect(updated).toMatchObject({ contact: "Martín", email: "compras@centro.test", updatedBy: "supervisor" });
    await catalog.setSupplierActive({ id: supplier.id, active: false, actorId: "admin" });
    expect((await catalog.getSupplier(supplier.id))?.active).toBe(false);
    expect(await catalog.listSuppliers()).toEqual([]);
    expect((await catalog.listSupplierRecords()).map((s) => s.name)).toEqual(["Distribuidora Centro"]);
  });

  it("creating an existing name reactivates and refreshes it", async () => {
    const first = await catalog.createSupplier({ ...full, actorId: ADMIN });
    await catalog.setSupplierActive({ id: first.id, active: false, actorId: ADMIN });
    const again = await catalog.createSupplier({ name: "distribuidora centro", contact: "Nuevo", actorId: ADMIN });
    expect(again).toMatchObject({ id: first.id, active: true, contact: "Nuevo", taxId: "" });
  });

  it("enforces unique names and tax ids", async () => {
    const a = await catalog.createSupplier({ ...full, actorId: ADMIN });
    const b = await catalog.createSupplier({ name: "Otro", actorId: ADMIN });
    await expect(catalog.createSupplier({ name: "Tercero", taxId: full.taxId, actorId: ADMIN })).rejects.toThrow(
      "Ya existe otro proveedor con ese CUIT.",
    );
    await expect(catalog.updateSupplier({ id: b.id, name: "DISTRIBUIDORA CENTRO", actorId: ADMIN })).rejects.toThrow(
      "Ya existe otro proveedor con ese nombre.",
    );
    await expect(catalog.updateSupplier({ id: a.id, name: a.name, taxId: full.taxId, actorId: ADMIN })).resolves.toBeDefined();
    await expect(catalog.updateSupplier({ id: "nope", name: "X", actorId: ADMIN })).rejects.toThrow("El proveedor no existe.");
    await expect(catalog.createSupplier({ name: "", actorId: ADMIN })).rejects.toThrow("El nombre del proveedor es obligatorio.");
    await expect(catalog.createSupplier({ name: "Z", email: "mal", actorId: ADMIN })).rejects.toThrow(
      "El correo electrónico no tiene un formato válido.",
    );
  });

  it("cannot archive a supplier used by active products", async () => {
    const supplier = await catalog.createSupplier({ name: "Proveedor", actorId: ADMIN });
    await catalog.createProduct({ name: "P", categoryName: "General", supplierId: supplier.id, actorId: ADMIN });
    await expect(catalog.setSupplierActive({ id: supplier.id, active: false, actorId: ADMIN })).rejects.toThrow(
      "No se puede archivar: hay productos activos que usan este proveedor.",
    );
    await expect(catalog.setSupplierActive({ id: "nope", active: true, actorId: ADMIN })).rejects.toThrow("El proveedor no existe.");
  });
});

describe("units and payment methods", () => {
  it("lists payment methods by sequence and resolves an active one by name", async () => {
    expect((await catalog.listPaymentMethodRecords()).map((m) => [m.code, m.sequence])).toEqual([
      ["EFECTIVO", 10], ["TRANSFERENCIA", 20], ["TARJETA", 30], ["MERCADO_PAGO", 40], ["OTRO", 90],
    ]);
    expect(await catalog.resolveActivePaymentMethod("  mercado pago ")).toMatchObject({ code: "MERCADO_PAGO", name: "Mercado Pago" });
    await expect(catalog.resolveActivePaymentMethod("Nave")).rejects.toThrow(
      "El medio de pago no existe o está inactivo.",
    );
    const mercadoPago = (await catalog.listPaymentMethods()).find((m) => m.code === "MERCADO_PAGO")!;
    await catalog.setPaymentMethodActive({ id: mercadoPago.id, active: false });
    expect((await catalog.listPaymentMethods()).map((m) => m.name)).not.toContain("Mercado Pago");
    await expect(catalog.resolveActivePaymentMethod("Mercado Pago")).rejects.toThrow("El medio de pago no existe o está inactivo.");
    await expect(catalog.setPaymentMethodActive({ id: "nope", active: true })).rejects.toThrow(
      "No se encontró el registro del catálogo.",
    );
    await expect(catalog.setUnitActive({ id: "nope", active: true })).rejects.toThrow(
      "No se encontró el registro del catálogo.",
    );
  });
});
