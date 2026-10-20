import { randomUUID } from "node:crypto";
import { eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { narrowUnitOfWork } from "@/shared/application/unit-of-work";
import { createDbConnection, type DbConnection } from "@/shared/infrastructure/db/client";
import { drizzleUnitOfWork } from "@/shared/infrastructure/db/unit-of-work";
import { seedReferenceData } from "@/shared/infrastructure/db/seed-reference";
import {
  cashEvents,
  cashMovements,
  cashSessions,
  movements,
  productCategories,
  products,
  recipeComponents,
  saleOrderLines,
  saleOrders,
  stockLevels,
  stockMovements,
  users,
} from "@/shared/infrastructure/db/schema";
import { UuidGenerator, getCashBalance, openCashSession, type CashDeps } from "@/modules/cash";
import { catalogUseCases, productUpdateFromEdits, type CatalogDeps } from "@/modules/catalog";
import { inventoryUseCases, type InventoryDeps } from "@/modules/inventory";
import { ledgerUseCases, type LedgerDeps } from "@/modules/ledger";
import { reportingUseCases, type ReportingDeps } from "@/modules/reporting";
import { buildAppRepositories, type AppRepositories } from "./app-repositories";

const url = process.env.DATABASE_URL;

/**
 * The /productos screen writes through the catalog / inventory / ledger use cases. These tests prove two things:
 * the new history read model, and that editing products there never changes how the POS lists or sells them.
 */
describe.skipIf(!url)("/productos use cases against Postgres", () => {
  const tag = randomUUID().slice(0, 8);
  const n = (name: string) => `IT-${tag} ${name}`;
  const runtime = { clock: { now: () => new Date(), businessDate: () => "2086-03-04" }, ids: new UuidGenerator() };
  let conn: DbConnection;
  let uow: ReturnType<typeof drizzleUnitOfWork<AppRepositories>>;
  let cashDeps: CashDeps;
  let catalog: ReturnType<typeof catalogUseCases>;
  let inventory: ReturnType<typeof inventoryUseCases>;
  let ledger: ReturnType<typeof ledgerUseCases>;
  let reporting: ReturnType<typeof reportingUseCases>;
  let admin: { id: string; role: "admin" };
  const createdUsers: string[] = [];
  const createdSessions: string[] = [];

  async function newUser(role: "admin" | "cashier") {
    const id = randomUUID();
    await conn.db.insert(users).values({ id, username: `it-${tag}-${id.slice(0, 6)}`, displayName: "Integration", role });
    createdUsers.push(id);
    return { id, role } as const;
  }

  const stockOf = async (id: string) => (await conn.db.select().from(stockLevels).where(eq(stockLevels.productId, id)))[0]?.quantity ?? 0;

  /** What `loadPosData` builds from the catalog + inventory (the POS reads nothing else about products). */
  async function posView() {
    const sellable = await catalog.listProducts({ sellableOnly: true });
    const available = await inventory.availableSaleQuantities(sellable.filter((p) => p.name.startsWith(`IT-${tag}`)).map((p) => p.id));
    return sellable
      .filter((p) => p.name.startsWith(`IT-${tag}`))
      .map((p) => ({ id: p.id, name: p.name, category: p.categoryName, price: p.salePrice, available: available[p.id] ?? null }));
  }

  beforeAll(async () => {
    conn = createDbConnection(url!, { max: 8 });
    await seedReferenceData(conn.db);
    uow = drizzleUnitOfWork<AppRepositories>(conn.db, (tx) => buildAppRepositories(tx, runtime));
    cashDeps = { uow: narrowUnitOfWork(uow, (r) => r.cash), ...runtime };
    const catalogDeps: CatalogDeps = { uow: narrowUnitOfWork(uow, (r) => r.catalog), ...runtime };
    const inventoryDeps: InventoryDeps = { uow: narrowUnitOfWork(uow, (r) => r.inventory), ...runtime };
    const ledgerDeps: LedgerDeps = { uow: narrowUnitOfWork(uow, (r) => r.ledger), ...runtime };
    const reportingDeps: ReportingDeps = { uow: narrowUnitOfWork(uow, (r) => r.reporting), clock: runtime.clock };
    catalog = catalogUseCases(catalogDeps);
    inventory = inventoryUseCases(inventoryDeps);
    ledger = ledgerUseCases(ledgerDeps);
    reporting = reportingUseCases(reportingDeps);
    admin = { id: (await newUser("admin")).id, role: "admin" };
  });

  afterAll(async () => {
    const mine = await conn.db.select({ id: products.id }).from(products).where(like(products.name, `IT-${tag}%`));
    const productIds = mine.map((p) => p.id);
    if (productIds.length > 0) await conn.db.delete(stockMovements).where(inArray(stockMovements.productId, productIds));
    if (createdUsers.length > 0) {
      const orders = await conn.db.select({ id: saleOrders.id }).from(saleOrders).where(inArray(saleOrders.createdBy, createdUsers));
      if (orders.length > 0) await conn.db.delete(saleOrderLines).where(inArray(saleOrderLines.orderId, orders.map((o) => o.id)));
      await conn.db.delete(movements).where(inArray(movements.createdBy, createdUsers));
      await conn.db.delete(saleOrders).where(inArray(saleOrders.createdBy, createdUsers));
    }
    if (createdSessions.length > 0) {
      await conn.db.delete(cashEvents).where(inArray(cashEvents.sessionId, createdSessions));
      await conn.db.delete(cashMovements).where(inArray(cashMovements.sessionId, createdSessions));
      await conn.db.delete(cashSessions).where(inArray(cashSessions.id, createdSessions));
    }
    if (productIds.length > 0) {
      await conn.db.delete(recipeComponents).where(inArray(recipeComponents.saleProductId, productIds));
      await conn.db.delete(stockLevels).where(inArray(stockLevels.productId, productIds));
      await conn.db.delete(products).where(inArray(products.id, productIds));
    }
    await conn.db.delete(productCategories).where(like(productCategories.name, `IT-${tag}%`));
    if (createdUsers.length > 0) await conn.db.delete(users).where(inArray(users.id, createdUsers));
    await conn.close();
  });

  it("the product history lists the stock audit rows newest first with the actor's username", async () => {
    const { product } = await catalog.createProduct({ name: n("Historial"), categoryName: n("Cat"), initialStock: 10, actorId: admin.id });
    await ledger.adjustStock({ actor: admin, productId: product.id, countedStock: 7, reason: "Conteo semanal" });
    await ledger.adjustStock({ actor: admin, productId: product.id, countedStock: 9, reason: "Reposición" });

    const history = await reporting.listProductStockHistory({ productId: product.id });
    expect(history.map((h) => [h.type, h.quantityDelta, h.stockBefore, h.stockAfter, h.reason])).toEqual([
      ["AJUSTE_FISICO", 2, 7, 9, "Reposición"],
      ["AJUSTE_FISICO", -3, 10, 7, "Conteo semanal"],
      ["AJUSTE_FISICO", 10, 0, 10, "Stock inicial"],
    ]);
    expect(history[0].actorUsername).toMatch(/^it-/);
    expect(history[0].createdAt).toBeInstanceOf(Date);
    expect(await reporting.listProductStockHistory({ productId: product.id, limit: 1 })).toHaveLength(1);
    expect(await reporting.listProductStockHistory({ productId: randomUUID() })).toEqual([]);
  });

  it("editing a product's Ficha, its recipe or its stock leaves the POS listing and the sale behaviour of everything else untouched", async () => {
    const fernet = (await catalog.createProduct({ name: n("Fernet"), categoryName: n("Insumos"), isSupply: true, isSellable: false, stockUnit: "ml", initialStock: 5000, actorId: admin.id })).product;
    const cola = (await catalog.createProduct({ name: n("Cola"), categoryName: n("Insumos"), isSupply: true, isSellable: false, stockUnit: "l", initialStock: 20, actorId: admin.id })).product;
    const vaso = (
      await catalog.createProduct({
        name: n("Vaso de fernet"), categoryName: n("Tragos"), salePrice: 600000, actorId: admin.id,
        recipe: [{ componentId: fernet.id, quantity: 70, unit: "ml" }, { componentId: cola.id, quantity: 230, unit: "ml" }],
      })
    ).product;
    const plain = (await catalog.createProduct({ name: n("Agua"), categoryName: n("Bebidas"), salePrice: 150000, initialStock: 6, actorId: admin.id })).product;

    const before = await posView();
    expect(before.find((p) => p.id === vaso.id)?.price).toBe(600000);
    expect(before.find((p) => p.id === vaso.id)?.available).toBeCloseTo(5000 / 70, 6); // min(5000/70, 20/0.23)
    expect(before.find((p) => p.id === plain.id)).toMatchObject({ price: 150000, available: 6 });

    // 1. Saving the Ficha of the recipe product with the same values changes nothing the POS reads.
    const current = (await catalog.getProduct(vaso.id))!;
    await catalog.updateProduct(
      productUpdateFromEdits(current, { name: current.name, categoryId: current.categoryId, price: current.salePrice, sellable: current.isSellable, sku: current.sku }, admin.id),
    );
    expect(await posView()).toEqual(before);
    const saved = (await catalog.getProduct(vaso.id))!;
    expect(saved).toMatchObject({ isCompound: true, controlsStock: false, stockUnit: current.stockUnit, isSellable: true });

    // 2. Renaming / repricing the plain product only changes that product's row.
    const plainNow = (await catalog.getProduct(plain.id))!;
    await catalog.updateProduct(
      productUpdateFromEdits(plainNow, { name: n("Agua mineral"), categoryId: plainNow.categoryId, price: 200000, sellable: true, sku: "" }, admin.id),
    );
    const after = await posView();
    expect(after.find((p) => p.id === plain.id)).toMatchObject({ name: n("Agua mineral"), price: 200000, available: 6 });
    expect(after.filter((p) => p.id !== plain.id)).toEqual(before.filter((p) => p.id !== plain.id));

    // 3. A stock count of a component and a recipe update flow through the same sale path as before.
    await ledger.adjustStock({ actor: admin, productId: fernet.id, countedStock: 700, reason: "Conteo" });
    await inventory.setRecipeComponent({ saleProductId: vaso.id, componentId: fernet.id, quantity: 0.1, unit: "l", actorId: admin.id }); // 0.1 l = 100 ml
    expect((await posView()).find((p) => p.id === vaso.id)?.available).toBeCloseTo(7, 6);

    const cashier = await newUser("cashier");
    const session = await openCashSession(cashDeps)({ userId: cashier.id, openingCash: 1_000_000 });
    createdSessions.push(session.id);
    const sale = await ledger.registerSaleTicket({ actor: cashier, lines: [{ productId: vaso.id, quantity: 2 }, { productId: plain.id, quantity: 1 }], paymentMethod: "Efectivo", notes: "" });
    expect(sale.total).toBe(2 * 600000 + 200000);
    expect(await stockOf(fernet.id)).toBeCloseTo(500, 6); // 700 - 2 * 100 ml
    expect(await stockOf(cola.id)).toBeCloseTo(19.54, 6); // 20 l - 2 * 0.23 l
    expect(await stockOf(plain.id)).toBe(5);
    expect(await getCashBalance(cashDeps)(session.id)).toBe(1_000_000 + 1_400_000);

    // 4. Deactivating takes the product off the POS (legacy); restoring brings it back as it was.
    await catalog.deactivateProduct({ id: plain.id, actorId: admin.id });
    expect((await posView()).some((p) => p.id === plain.id)).toBe(false);
    await catalog.restoreProduct({ id: plain.id, actorId: admin.id });
    expect((await posView()).find((p) => p.id === plain.id)).toMatchObject({ price: 200000, available: 5 });
  });
});
