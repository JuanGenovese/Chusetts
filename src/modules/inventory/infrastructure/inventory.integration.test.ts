import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDbConnection, type DbConnection } from "@/shared/infrastructure/db/client";
import { drizzleUnitOfWork } from "@/shared/infrastructure/db/unit-of-work";
import { seedReferenceData } from "@/shared/infrastructure/db/seed-reference";
import {
  movements,
  productCategories,
  products,
  recipeComponents,
  stockLevels,
  stockMovements,
  units,
  users,
} from "@/shared/infrastructure/db/schema";
import { createInventoryService, inventoryUseCases, type InventoryDeps } from "../application";
import { createInventoryRepositories } from "./drizzle-inventory-repositories";
import { SystemClockForTests, UuidForTests } from "./test-runtime";

const url = process.env.DATABASE_URL;
if (!url) {
  console.warn("[integration] DATABASE_URL is not set: skipping inventory integration tests. Copy .env.local.example to .env.local, run `pnpm supabase:start && pnpm db:migrate`.");
}

describe.skipIf(!url)("inventory module against Postgres", () => {
  const tag = randomUUID().slice(0, 8);
  let conn: DbConnection;
  let deps: InventoryDeps;
  let inv: ReturnType<typeof inventoryUseCases>;
  let actorId: string;
  let categoryId: string;
  const unitIds = new Map<string, string>();
  const productIds: string[] = [];
  const ledgerIds: string[] = [];

  /** Stock audit rows reference a ledger movement (FK): the ledger row always exists first. */
  async function ledgerRow(): Promise<string> {
    const id = randomUUID();
    await conn.db.insert(movements).values({
      id,
      businessDate: "2026-01-01",
      kind: "Venta",
      description: `IT-${tag} ledger stub`,
      createdBy: actorId,
      createdAt: new Date(),
    });
    ledgerIds.push(id);
    return id;
  }

  async function newProduct(
    name: string,
    over: Partial<typeof products.$inferInsert> & { stock?: number } = {},
  ): Promise<string> {
    const { stock, ...rest } = over;
    const id = randomUUID();
    const stockUnit = rest.stockUnit ?? "unidad";
    await conn.db.insert(products).values({
      id,
      name: `IT-${tag} ${name}`,
      sku: `IT-${tag}-${id}`,
      categoryId,
      stockUnit,
      stockUnitId: unitIds.get(stockUnit)!,
      ...rest,
    });
    productIds.push(id);
    if (stock) await conn.db.insert(stockLevels).values({ productId: id, quantity: stock });
    return id;
  }
  const stockOf = async (id: string) =>
    (await conn.db.select().from(stockLevels).where(eq(stockLevels.productId, id)))[0]?.quantity ?? 0;

  beforeAll(async () => {
    conn = createDbConnection(url!, { max: 8 });
    actorId = randomUUID();
    await conn.db.insert(users).values({ id: actorId, username: `it-${actorId}`, displayName: "Integration", role: "admin" });
    await seedReferenceData(conn.db);
    categoryId = randomUUID();
    await conn.db.insert(productCategories).values({ id: categoryId, name: `IT-${tag} cat` });
    for (const u of await conn.db.select().from(units)) unitIds.set(u.code, u.id);
    deps = {
      uow: drizzleUnitOfWork(conn.db, createInventoryRepositories),
      clock: new SystemClockForTests(),
      ids: new UuidForTests(),
    };
    inv = inventoryUseCases(deps);
  });

  afterAll(async () => {
    if (productIds.length > 0) {
      await conn.db.delete(stockMovements).where(inArray(stockMovements.productId, productIds));
      if (ledgerIds.length > 0) await conn.db.delete(movements).where(inArray(movements.id, ledgerIds));
      await conn.db.delete(recipeComponents).where(inArray(recipeComponents.saleProductId, productIds));
      await conn.db.delete(stockLevels).where(inArray(stockLevels.productId, productIds));
      await conn.db.delete(products).where(inArray(products.id, productIds));
    }
    await conn.db.delete(productCategories).where(eq(productCategories.id, categoryId));
    await conn.db.delete(users).where(eq(users.id, actorId));
    await conn.close();
  });

  it("the fernet recipe consumes milliliters with unit conversion and reverses exactly", async () => {
    const fernet = await newProduct("Fernet", { stockUnit: "ml", isSellable: false, stock: 750 });
    const coca = await newProduct("Coca", { stockUnit: "ml", isSellable: false, stock: 2250 });
    const glass = await newProduct("Vaso fernet", { controlsStock: false });
    await inv.setRecipeComponent({ saleProductId: glass, componentId: fernet, quantity: 70, unit: "ml", actorId });
    await inv.setRecipeComponent({ saleProductId: glass, componentId: coca, quantity: 0.23, unit: "l", actorId });
    expect(
      (await conn.db.select().from(products).where(eq(products.id, glass)))[0],
    ).toMatchObject({ controlsStock: false, isCompound: true, updatedBy: actorId });

    const movementId = await ledgerRow();
    await inv.consumeSaleStock({ movementId, productId: glass, quantity: 1, actorId });
    expect(await stockOf(fernet)).toBe(680);
    expect(await stockOf(coca)).toBe(2020);
    expect(await inv.availableSaleQuantity(glass)).toBeCloseTo(Math.min(680 / 70, 2020 / 230));
    await expect(inv.consumeSaleStock({ movementId, productId: glass, quantity: 1, actorId })).rejects.toThrow(
      "La venta ya impactó el inventario.",
    );

    expect(await inv.reverseMovementStock({ movementId, actorId })).toBe(2);
    expect(await stockOf(fernet)).toBe(750);
    expect(await stockOf(coca)).toBe(2250);
    expect(await inv.reverseMovementStock({ movementId, actorId })).toBe(0);
    const recipe = await inv.getRecipe(glass);
    expect(recipe.map((r) => [r.componentName.replace(`IT-${tag} `, ""), r.quantity, r.unit, r.stockQuantity, r.stockUnit])).toEqual([
      ["Coca", 0.23, "l", 230, "ml"],
      ["Fernet", 70, "ml", 70, "ml"],
    ]);
  });

  it("origin keys make stock impact idempotent even after a reversal (DB constraint mapped to InventoryError)", async () => {
    const water = await newProduct("Agua", { stock: 10 });
    const movementId = await ledgerRow();
    await inv.consumeSaleStock({ movementId, productId: water, quantity: 1, actorId });
    await inv.reverseMovementStock({ movementId, actorId });
    await expect(inv.consumeSaleStock({ movementId, productId: water, quantity: 1, actorId })).rejects.toThrow(
      "Este movimiento ya impactó el inventario.",
    );
    expect(await stockOf(water)).toBe(10);
  });

  it("adjustments are audited and listed newest first", async () => {
    const water = await newProduct("Agua 2", { stock: 10 });
    const result = await inv.createStockAdjustment({ productId: water, countedStock: 8, actorId, reason: "Conteo semanal", movementId: await ledgerRow() });
    expect(result).toMatchObject({ previousStock: 10, newStock: 8, delta: -2 });
    await inv.createStockAdjustment({ productId: water, countedStock: 9, actorId, reason: "Recuento", movementId: await ledgerRow() });
    const history = await inv.listStockMovements({ productId: water });
    expect(history.map((h) => [h.reason, h.stockBefore, h.stockAfter, h.type])).toEqual([
      ["Recuento", 8, 9, "AJUSTE_FISICO"],
      ["Conteo semanal", 10, 8, "AJUSTE_FISICO"],
    ]);
    await expect(inv.createStockAdjustment({ productId: water, countedStock: 9, actorId, reason: "x" })).rejects.toThrow(
      "El stock contado coincide con el stock del sistema.",
    );
  });

  it("the first movement of a product that never had stock creates its level row; negatives are blocked", async () => {
    const fresh = await newProduct("Fresco");
    await inv.applyDirectStockDelta({ movementId: await ledgerRow(), productId: fresh, quantityDelta: 7.5, actorId, movementType: "INGRESO_COMPRA" });
    expect(await stockOf(fresh)).toBe(7.5);
    await expect(
      inv.applyDirectStockDelta({ movementId: await ledgerRow(), productId: fresh, quantityDelta: -8, actorId }),
    ).rejects.toThrow("El movimiento dejaría el stock en negativo.");
    expect(await stockOf(fresh)).toBe(7.5);
  });

  it("serializes concurrent sales of the last unit with row locks (exactly one wins)", async () => {
    const last = await newProduct("Última", { stock: 1 });
    const movementIds = await Promise.all(Array.from({ length: 6 }, () => ledgerRow()));
    const attempts = await Promise.allSettled(
      movementIds.map((movementId) => inv.consumeSaleStock({ movementId, productId: last, quantity: 1, actorId })),
    );
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    for (const a of attempts.filter((x) => x.status === "rejected")) {
      expect((a as PromiseRejectedResult).reason.message).toMatch(/^Stock insuficiente\./);
    }
    expect(await stockOf(last)).toBe(0);
  });

  it("rolls back every stock write when the surrounding work fails (ledger-style transaction)", async () => {
    const a = await newProduct("Rollback A", { stock: 5 });
    const b = await newProduct("Rollback B", { stock: 5 });
    const [movementA, movementB] = [await ledgerRow(), await ledgerRow()];
    await expect(
      deps.uow.run(async (repos) => {
        const service = createInventoryService(repos, deps);
        await service.consumeSaleStock({ movementId: movementA, productId: a, quantity: 2, actorId });
        await service.consumeSaleStock({ movementId: movementB, productId: b, quantity: 2, actorId });
        throw new Error("cash failed");
      }),
    ).rejects.toThrow("cash failed");
    expect(await stockOf(a)).toBe(5);
    expect(await stockOf(b)).toBe(5);
    expect(await inv.listStockMovements({ productId: a })).toHaveLength(0);
  });

  it("rejects circular recipes and rolls the failed recipe back", async () => {
    const x = await newProduct("Ciclo X", { controlsStock: false });
    const y = await newProduct("Ciclo Y", { controlsStock: false });
    await inv.setRecipeComponent({ saleProductId: x, componentId: y, quantity: 1, actorId });
    await expect(inv.setRecipeComponent({ saleProductId: y, componentId: x, quantity: 1, actorId })).rejects.toThrow(
      "La receta contiene una referencia circular.",
    );
    expect(await inv.hasRecipe(y)).toBe(false);
  });

  it("keeps one recipe row per component and removes by id + product", async () => {
    const base = await newProduct("Base", { stock: 3 });
    const combo = await newProduct("Combo", { controlsStock: false });
    await inv.setRecipeComponent({ saleProductId: combo, componentId: base, quantity: 1, actorId });
    await inv.setRecipeComponent({ saleProductId: combo, componentId: base, quantity: 3, actorId });
    const [line] = await inv.getRecipe(combo);
    expect(await inv.getRecipe(combo)).toHaveLength(1);
    expect(line).toMatchObject({ quantity: 3, stockQuantity: 3 });
    await inv.removeRecipeComponent({ recipeId: line.id, saleProductId: base });
    expect(await inv.getRecipe(combo)).toHaveLength(1);
    await inv.removeRecipeComponent({ recipeId: line.id, saleProductId: combo });
    expect(await inv.getRecipe(combo)).toHaveLength(0);
  });
});
