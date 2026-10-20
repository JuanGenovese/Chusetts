import { beforeEach, describe, expect, it } from "vitest";
import { InventoryError } from "../domain";
import { makeInventoryTestDeps } from "./testing/in-memory";
import { createInventoryService, inventoryUseCases } from "./index";

let t: ReturnType<typeof makeInventoryTestDeps>;
let inv: ReturnType<typeof inventoryUseCases>;
const ADMIN = "admin-1";
const CASHIER = "cashier-1";

beforeEach(() => {
  t = makeInventoryTestDeps();
  inv = inventoryUseCases(t.deps);
});

describe("recipes and sale consumption", () => {
  it("a promo consumes the base product and is reversed exactly", async () => {
    const pinta = t.store.addProduct({ name: "Pinta base", stock: 10, stockUnit: "unidad" });
    const promo = t.store.addProduct({ name: "Promo 3 pintas", stock: 999, controlsStock: false });
    await inv.setRecipeComponent({ saleProductId: promo, componentId: pinta, quantity: 3, actorId: ADMIN });

    await inv.consumeSaleStock({ movementId: "m-1", productId: promo, quantity: 2, actorId: CASHIER });
    expect(t.store.stock(pinta)).toBe(4);
    expect(t.store.stock(promo)).toBe(999); // the promo itself is never touched
    expect(await inv.availableSaleQuantity(promo)).toBeCloseTo(4 / 3);

    expect(await inv.reverseMovementStock({ movementId: "m-1", actorId: ADMIN })).toBe(1);
    expect(t.store.stock(pinta)).toBe(10);
  });

  it("glasses can consume fractional bottles", async () => {
    const bottle = t.store.addProduct({ name: "Botella Fernet", stock: 2, isSellable: false });
    const glass = t.store.addProduct({ name: "Vaso Fernet", controlsStock: false });
    await inv.setRecipeComponent({ saleProductId: glass, componentId: bottle, quantity: 0.0667, actorId: ADMIN });
    await inv.consumeSaleStock({ movementId: "m-1", productId: glass, quantity: 3, actorId: CASHIER });
    expect(t.store.stock(bottle)).toBeCloseTo(1.7999, 4);
  });

  it("insufficient component stock blocks the sale and writes nothing", async () => {
    const base = t.store.addProduct({ name: "Base escasa", stock: 2 });
    const promo = t.store.addProduct({ name: "Promo imposible", controlsStock: false });
    await inv.setRecipeComponent({ saleProductId: promo, componentId: base, quantity: 3, actorId: ADMIN });
    await expect(
      inv.consumeSaleStock({ movementId: "m-1", productId: promo, quantity: 1, actorId: CASHIER }),
    ).rejects.toThrow("Stock insuficiente. Base escasa: disponible 2 unidad, requerido 3");
    expect(t.store.stock(base)).toBe(2);
    expect(t.store.stockMovements).toHaveLength(0);
  });

  it("rejects circular recipes", async () => {
    const a = t.store.addProduct({ name: "Receta A", controlsStock: false });
    const b = t.store.addProduct({ name: "Receta B", controlsStock: false });
    await inv.setRecipeComponent({ saleProductId: a, componentId: b, quantity: 1, actorId: ADMIN });
    await expect(inv.setRecipeComponent({ saleProductId: b, componentId: a, quantity: 1, actorId: ADMIN })).rejects.toThrow(
      "La receta contiene una referencia circular.",
    );
    // the failed attempt was rolled back
    expect(t.store.recipes.filter((r) => r.saleProductId === b)).toHaveLength(0);
  });

  it("the fernet recipe consumes milliliters precisely and converts units", async () => {
    const fernet = t.store.addProduct({ name: "Fernet", stock: 750, stockUnit: "ml", isSellable: false });
    const coca = t.store.addProduct({ name: "Coca", stock: 2250, stockUnit: "ml", isSellable: false });
    const glass = t.store.addProduct({ name: "Vaso de fernet", controlsStock: false });
    await inv.setRecipeComponent({ saleProductId: glass, componentId: fernet, quantity: 70, actorId: ADMIN, unit: "ml" });
    await inv.setRecipeComponent({ saleProductId: glass, componentId: coca, quantity: 0.23, actorId: ADMIN, unit: "l" });
    await inv.consumeSaleStock({ movementId: "m-1", productId: glass, quantity: 1, actorId: CASHIER });
    expect(t.store.stock(fernet)).toBe(680);
    expect(t.store.stock(coca)).toBe(2020);
    const recipe = await inv.getRecipe(glass);
    expect(recipe.map((r) => [r.componentName, r.quantity, r.unit, r.stockQuantity, r.stockUnit])).toEqual([
      ["Coca", 0.23, "l", 230, "ml"],
      ["Fernet", 70, "ml", 70, "ml"],
    ]);
  });

  it("setting a recipe component marks the product compound without own stock", async () => {
    const base = t.store.addProduct({ name: "Base", stock: 5 });
    const promo = t.store.addProduct({ name: "Promo" });
    await inv.setRecipeComponent({ saleProductId: promo, componentId: base, quantity: 1, actorId: ADMIN });
    expect(t.store.product(promo)).toMatchObject({ controlsStock: false, isCompound: true });
    expect(await inv.hasRecipe(promo)).toBe(true);
    expect(await inv.hasRecipe(base)).toBe(false);
  });

  it("updating a component keeps one row per (product, component)", async () => {
    const base = t.store.addProduct({ name: "Base", stock: 5 });
    const promo = t.store.addProduct({ name: "Promo" });
    await inv.setRecipeComponent({ saleProductId: promo, componentId: base, quantity: 1, actorId: ADMIN });
    await inv.setRecipeComponent({ saleProductId: promo, componentId: base, quantity: 2, actorId: ADMIN });
    expect(t.store.recipes).toHaveLength(1);
    expect(t.store.recipes[0]).toMatchObject({ quantity: 2, stockQuantity: 2 });
  });

  it("validates recipe components", async () => {
    const base = t.store.addProduct({ name: "Jarabe", stock: 1000, stockUnit: "ml" });
    const sale = t.store.addProduct({ name: "Trago", controlsStock: false });
    const inactive = t.store.addProduct({ name: "Viejo", active: false });
    const set = (over: Partial<Parameters<typeof inv.setRecipeComponent>[0]>) =>
      inv.setRecipeComponent({ saleProductId: sale, componentId: base, quantity: 1, actorId: ADMIN, ...over });
    await expect(set({ componentId: sale })).rejects.toThrow("Un producto no puede consumirse a sí mismo.");
    await expect(set({ quantity: 0 })).rejects.toThrow("La cantidad consumida debe ser mayor que cero.");
    await expect(set({ saleProductId: inactive })).rejects.toThrow("El producto vendido no existe o está inactivo.");
    await expect(set({ saleProductId: "nope" })).rejects.toThrow("El producto vendido no existe o está inactivo.");
    await expect(set({ componentId: inactive })).rejects.toThrow("El componente no existe o está inactivo.");
    await expect(set({ unit: "kg" })).rejects.toThrow("No se puede convertir kg a ml: pertenecen a magnitudes distintas.");
    await expect(set({ unit: "oz" })).rejects.toThrow("Unidad no compatible. Usá unidad, ml, l, g o kg.");
  });

  it("a compound product without recipe cannot be sold", async () => {
    const empty = t.store.addProduct({ name: "Vacío", controlsStock: false, isCompound: true });
    await expect(inv.stockRequirements({ productId: empty, saleQuantity: 1 })).rejects.toThrow(
      "“Vacío” está marcado como compuesto pero no tiene receta.",
    );
    expect(await inv.availableSaleQuantity(empty)).toBe(0);
  });

  it("products without stock control and without recipe need nothing (availability is unlimited)", async () => {
    const service = t.store.addProduct({ name: "Servicio", controlsStock: false });
    expect(await inv.stockRequirements({ productId: service, saleQuantity: 4 })).toEqual({});
    expect(await inv.availableSaleQuantity(service)).toBeNull();
    await expect(inv.stockRequirements({ productId: service, saleQuantity: 0 })).rejects.toThrow(
      "La cantidad vendida debe ser mayor que cero.",
    );
    await expect(inv.stockRequirements({ productId: "nope" })).rejects.toThrow("El producto no existe o está inactivo.");
  });

  it("removes a component by recipe id and product id", async () => {
    const base = t.store.addProduct({ name: "Base", stock: 5 });
    const promo = t.store.addProduct({ name: "Promo" });
    await inv.setRecipeComponent({ saleProductId: promo, componentId: base, quantity: 1, actorId: ADMIN });
    const [line] = await inv.getRecipe(promo);
    await inv.removeRecipeComponent({ recipeId: line.id, saleProductId: "other" });
    expect(await inv.getRecipe(promo)).toHaveLength(1);
    await inv.removeRecipeComponent({ recipeId: line.id, saleProductId: promo });
    expect(await inv.getRecipe(promo)).toHaveLength(0);
  });
});

describe("purchases and conversions", () => {
  it("applies the purchase factor", async () => {
    const id = t.store.addProduct({ name: "Fernet 750", stockUnit: "ml", isPurchasable: true, purchaseFactor: 750 });
    expect(await inv.purchaseToStockQuantity({ productId: id, purchaseQuantity: 10 })).toBe(7500);
  });

  it("validates purchases", async () => {
    const ok = t.store.addProduct({ name: "Ok", isPurchasable: true });
    const no = t.store.addProduct({ name: "No comprable", isPurchasable: false });
    const bad = t.store.addProduct({ name: "Factor roto", isPurchasable: true, purchaseFactor: 0 });
    const gone = t.store.addProduct({ name: "Inactivo", active: false });
    await expect(inv.purchaseToStockQuantity({ productId: ok, purchaseQuantity: 0 })).rejects.toThrow(
      "La cantidad comprada debe ser mayor que cero.",
    );
    await expect(inv.purchaseToStockQuantity({ productId: gone, purchaseQuantity: 1 })).rejects.toThrow(
      "El producto no existe o está inactivo.",
    );
    await expect(inv.purchaseToStockQuantity({ productId: no, purchaseQuantity: 1 })).rejects.toThrow(
      "El producto no está habilitado para compras.",
    );
    await expect(inv.purchaseToStockQuantity({ productId: bad, purchaseQuantity: 1 })).rejects.toThrow(
      "La conversión de compra a stock debe ser mayor que cero.",
    );
  });
});

describe("stock adjustments and direct deltas", () => {
  it("an adjustment is audited and a repeated sale movement is blocked", async () => {
    const water = t.store.addProduct({ name: "Agua", stock: 10, categoryName: "Bebidas" });
    const result = await inv.createStockAdjustment({
      productId: water, countedStock: 8, actorId: ADMIN, reason: " Conteo semanal ",
    });
    expect(result).toMatchObject({ productName: "Agua", categoryName: "Bebidas", previousStock: 10, newStock: 8, delta: -2 });
    expect(t.store.stockMovements[0]).toMatchObject({
      movementId: result.movementId,
      productId: water,
      quantityDelta: -2,
      type: "AJUSTE_FISICO",
      reason: "Conteo semanal",
      stockBefore: 10,
      stockAfter: 8,
      actorId: ADMIN,
      referenceType: "AJUSTE_STOCK",
      originKey: `AJUSTE:${result.movementId}:PRODUCTO:${water}`,
    });

    await inv.consumeSaleStock({ movementId: "sale-1", productId: water, quantity: 1, actorId: CASHIER });
    await expect(
      inv.consumeSaleStock({ movementId: "sale-1", productId: water, quantity: 1, actorId: CASHIER }),
    ).rejects.toThrow("La venta ya impactó el inventario.");
    expect(t.store.stock(water)).toBe(7);
  });

  it("validates adjustments", async () => {
    const water = t.store.addProduct({ name: "Agua", stock: 10 });
    const recipe = t.store.addProduct({ name: "Combo", controlsStock: false });
    const adjust = (productId: string, countedStock: number, reason = "motivo") =>
      inv.createStockAdjustment({ productId, countedStock, actorId: ADMIN, reason });
    await expect(adjust(water, 5, "  ")).rejects.toThrow("El motivo del ajuste es obligatorio.");
    await expect(adjust(water, -1)).rejects.toThrow("El stock físico contado no puede ser negativo.");
    await expect(adjust("nope", 1)).rejects.toThrow("El producto no existe o está inactivo.");
    await expect(adjust(recipe, 1)).rejects.toThrow("Este producto no controla stock propio.");
    await expect(adjust(water, 10)).rejects.toThrow("El stock contado coincide con el stock del sistema.");
  });

  it("plans an adjustment (validations + delta) without writing anything", async () => {
    const water = t.store.addProduct({ name: "Agua", stock: 10, categoryName: "Bebidas" });
    const service = createInventoryService(t.store.repositories(), t.deps);
    const plan = await service.planStockAdjustment({ productId: water, countedStock: 7.5, reason: " Conteo " });
    expect(plan).toEqual({
      productId: water, productName: "Agua", categoryName: "Bebidas", previousStock: 10, newStock: 7.5, delta: -2.5, reason: "Conteo",
    });
    expect(t.store.stock(water)).toBe(10);
    expect(t.store.stockMovements).toHaveLength(0);
    await expect(service.planStockAdjustment({ productId: water, countedStock: 10, reason: "x" })).rejects.toThrow(
      "El stock contado coincide con el stock del sistema.",
    );
    await expect(service.planStockAdjustment({ productId: water, countedStock: 1, reason: " " })).rejects.toThrow(
      "El motivo del ajuste es obligatorio.",
    );
  });

  it("applies direct deltas (purchase intake) and rejects invalid ones", async () => {
    const id = t.store.addProduct({ name: "Fernet", stock: 100, stockUnit: "ml" });
    const combo = t.store.addProduct({ name: "Combo", controlsStock: false });
    await inv.applyDirectStockDelta({
      movementId: "buy-1", productId: id, quantityDelta: 7500, actorId: ADMIN,
      movementType: "INGRESO_COMPRA", reason: "Ingreso por compra",
    });
    expect(t.store.stock(id)).toBe(7600);
    expect(t.store.stockMovements[0]).toMatchObject({
      type: "INGRESO_COMPRA",
      referenceType: "MOVIMIENTO",
      referenceId: "buy-1",
      originKey: `INGRESO_COMPRA:buy-1:PRODUCTO:${id}`,
    });
    const delta = (productId: string, quantityDelta: number, movementId = "m-x") =>
      inv.applyDirectStockDelta({ movementId, productId, quantityDelta, actorId: ADMIN });
    await expect(delta("nope", 1)).rejects.toThrow("El producto no existe.");
    await expect(delta(combo, 1)).rejects.toThrow("“Combo” usa una receta o no controla stock propio.");
    await expect(delta(id, 0)).rejects.toThrow("El movimiento de stock no puede ser cero.");
    await expect(delta(id, 5, "buy-1")).resolves.toBeUndefined(); // default type has another origin key
    await expect(
      inv.applyDirectStockDelta({ movementId: "buy-1", productId: id, quantityDelta: 1, actorId: ADMIN, movementType: "INGRESO_COMPRA" }),
    ).rejects.toThrow("Este movimiento ya impactó el inventario.");
    await expect(delta(id, -1e6)).rejects.toThrow("El movimiento dejaría el stock en negativo.");
  });

  it("reversal restores stock, flags the rows and is idempotent", async () => {
    const id = t.store.addProduct({ name: "Agua", stock: 10 });
    await inv.consumeSaleStock({ movementId: "s-1", productId: id, quantity: 4, actorId: CASHIER });
    expect(await inv.reverseMovementStock({ movementId: "s-1", actorId: ADMIN })).toBe(1);
    expect(t.store.stock(id)).toBe(10);
    expect(t.store.stockMovements[0]).toMatchObject({ reverted: true, revertedBy: ADMIN });
    expect(await inv.reverseMovementStock({ movementId: "s-1", actorId: ADMIN })).toBe(0);
    expect(await inv.reverseMovementStock({ movementId: "unknown", actorId: ADMIN })).toBe(0);
    // the origin key stays burned after a reversal: the same ledger movement cannot impact stock twice
    await expect(inv.consumeSaleStock({ movementId: "s-1", productId: id, quantity: 1, actorId: CASHIER })).rejects.toThrow(
      /Este movimiento ya impactó el inventario/,
    );
  });

  it("lists the stock history newest first", async () => {
    const id = t.store.addProduct({ name: "Agua", stock: 10 });
    await inv.createStockAdjustment({ productId: id, countedStock: 8, actorId: ADMIN, reason: "uno" });
    await inv.createStockAdjustment({ productId: id, countedStock: 9, actorId: ADMIN, reason: "dos" });
    const history = await inv.listStockMovements({ productId: id });
    expect(history.map((h) => h.reason)).toEqual(["dos", "uno"]);
    expect(await inv.listStockMovements({ productId: id, limit: 1 })).toHaveLength(1);
  });
});

describe("availability and stock levels", () => {
  it("reports availability per product and the stock snapshot", async () => {
    const a = t.store.addProduct({ name: "A", stock: 6 });
    const combo = t.store.addProduct({ name: "Combo", controlsStock: false });
    const free = t.store.addProduct({ name: "Free", controlsStock: false });
    await inv.setRecipeComponent({ saleProductId: combo, componentId: a, quantity: 4, actorId: ADMIN });
    expect(await inv.availableSaleQuantities([a, combo, free])).toEqual({ [a]: 6, [combo]: 1.5, [free]: null });
    expect(await inv.getStockLevel(a)).toBe(6);
    expect(await inv.listStockLevels()).toEqual(expect.arrayContaining([{ productId: a, quantity: 6 }]));
  });
});

describe("ledger-style usage inside a shared transaction", () => {
  it("rolls everything back when the surrounding work fails", async () => {
    const id = t.store.addProduct({ name: "Agua", stock: 10 });
    await expect(
      t.deps.uow.run(async (repos) => {
        const service = createInventoryService(repos, t.deps);
        await service.consumeSaleStock({ movementId: "s-9", productId: id, quantity: 3, actorId: CASHIER });
        throw new Error("cash failed");
      }),
    ).rejects.toThrow("cash failed");
    expect(t.store.stock(id)).toBe(10);
    expect(t.store.stockMovements).toHaveLength(0);
  });

  it("surfaces InventoryError instances", async () => {
    await expect(inv.reverseMovementStock({ movementId: "", actorId: ADMIN })).resolves.toBe(0);
    await expect(inv.stockRequirements({ productId: "nope" })).rejects.toBeInstanceOf(InventoryError);
  });
});
