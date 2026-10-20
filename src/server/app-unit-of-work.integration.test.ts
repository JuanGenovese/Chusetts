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
  stockLevels,
  stockMovements,
  users,
} from "@/shared/infrastructure/db/schema";
import {
  SystemClock,
  UuidGenerator,
  buildCashMovement,
  getCashBalance,
  openCashSession,
  type CashDeps,
} from "@/modules/cash";
import { createCatalogService } from "@/modules/catalog";
import { createInventoryService } from "@/modules/inventory";
import { buildAppRepositories, type AppRepositories } from "./app-repositories";

const url = process.env.DATABASE_URL;
if (!url) {
  console.warn("[integration] DATABASE_URL is not set: skipping multi-module integration tests. Copy .env.local.example to .env.local, run `pnpm supabase:start && pnpm db:migrate`.");
}

describe.skipIf(!url)("one unit of work across cash + catalog + inventory", () => {
  const tag = randomUUID().slice(0, 8);
  const n = (name: string) => `IT-${tag} ${name}`;
  const runtime = { clock: new SystemClock(), ids: new UuidGenerator() };
  let conn: DbConnection;
  let uow: ReturnType<typeof drizzleUnitOfWork<AppRepositories>>;
  let cashDeps: CashDeps;
  let actorId: string;
  let sessionId: string;

  beforeAll(async () => {
    conn = createDbConnection(url!, { max: 5 });
    actorId = randomUUID();
    await conn.db.insert(users).values({ id: actorId, username: `it-${actorId}`, displayName: "Integration", role: "admin" });
    await seedReferenceData(conn.db);
    uow = drizzleUnitOfWork<AppRepositories>(conn.db, (tx) => buildAppRepositories(tx, runtime));
    cashDeps = { uow: narrowUnitOfWork(uow, (r) => r.cash), ...runtime };
    sessionId = (await openCashSession(cashDeps)({ userId: actorId, openingCash: 1_000_000 })).id;
  });

  afterAll(async () => {
    const mine = await conn.db.select({ id: products.id }).from(products).where(like(products.name, `IT-${tag}%`));
    const ids = mine.map((p) => p.id);
    if (ids.length > 0) {
      await conn.db.delete(stockMovements).where(inArray(stockMovements.productId, ids));
      await conn.db.delete(movements).where(eq(movements.createdBy, actorId));
      await conn.db.delete(recipeComponents).where(inArray(recipeComponents.saleProductId, ids));
      await conn.db.delete(stockLevels).where(inArray(stockLevels.productId, ids));
      await conn.db.delete(products).where(inArray(products.id, ids));
    }
    await conn.db.delete(productCategories).where(like(productCategories.name, `IT-${tag}%`));
    await conn.db.delete(cashEvents).where(eq(cashEvents.sessionId, sessionId));
    await conn.db.delete(cashMovements).where(eq(cashMovements.sessionId, sessionId));
    await conn.db.delete(cashSessions).where(eq(cashSessions.id, sessionId));
    await conn.db.delete(users).where(eq(users.id, actorId));
    await conn.close();
  });

  /** Minimal ledger "Venta" row so the stock audit rows have something to reference. */
  const stubSale = (id: string, productId: string, productName: string) => ({
    id, number: 0, businessDate: "2026-01-01", kind: "Venta" as const, category: null, categoryId: null,
    description: productName, productId, productName, quantity: 1, unitPrice: 0, amount: 0,
    paymentMethodId: null, paymentMethodName: "Efectivo", supplierId: null, supplierName: "", notes: "", createdBy: actorId,
    createdAt: new Date(), voided: false, voidReason: null, voidedBy: null, voidedAt: null, ticketId: null, cashSessionId: null, saleOrderId: null,
  });

  /** A ledger-style checkout: new product (with stock + recipe) -> sale consumes stock -> cash sale. */
  async function checkout(repos: AppRepositories, label: string) {
    const catalog = createCatalogService(repos.catalog, runtime);
    const inventory = createInventoryService(repos.inventory, runtime);
    const { product: beer } = await catalog.createProduct({
      name: n(`${label} cerveza`), categoryName: n("Checkout"), isSellable: false, isSupply: true, initialStock: 10, actorId,
    });
    const { product: promo } = await catalog.createProduct({
      name: n(`${label} promo`), categoryName: n("Checkout"), salePrice: 900_000,
      recipe: [{ componentId: beer.id, quantity: 3 }], actorId,
    });
    const saleMovementId = randomUUID();
    // The stock audit rows reference the ledger row, which therefore exists first (like the real ledger flow).
    await repos.ledger.movements.insert(stubSale(saleMovementId, promo.id, promo.name));
    await inventory.consumeSaleStock({ movementId: saleMovementId, productId: promo.id, quantity: 2, actorId });
    const movement = buildCashMovement({
      id: randomUUID(), sessionId, actor: actorId, type: "CASH_SALE", amount: 1_800_000, sign: 1,
      description: promo.name, reason: "Cobro de venta en efectivo", referenceType: "SALE_MOVEMENT",
      referenceId: saleMovementId, referenceKey: `MOVEMENT:${saleMovementId}`,
      previousBalance: await repos.cash.movements.balance(sessionId), now: new Date(),
    });
    await repos.cash.movements.insert(movement);
    return { beer, promo };
  }

  const countProducts = async (label: string) =>
    (await conn.db.select({ id: products.id }).from(products).where(like(products.name, `IT-${tag} ${label}%`))).length;

  it("commits catalog + inventory + cash together", async () => {
    const before = await getCashBalance(cashDeps)(sessionId);
    const { beer } = await uow.run((repos) => checkout(repos, "ok"));
    expect(await countProducts("ok")).toBe(2);
    expect(await getCashBalance(cashDeps)(sessionId)).toBe(before + 1_800_000);
    const [level] = await conn.db.select().from(stockLevels).where(eq(stockLevels.productId, beer.id));
    expect(level.quantity).toBe(4); // 10 initial - 2 promos * 3 beers
    const moves = await conn.db.select().from(stockMovements).where(eq(stockMovements.productId, beer.id));
    expect(moves.map((m) => m.type).sort()).toEqual(["AJUSTE_FISICO", "CONSUMO_VENTA"]);
    // The initial stock went through the ledger: an "Ajuste Stock" row that the stock audit row points at.
    const adjustment = moves.find((m) => m.type === "AJUSTE_FISICO")!;
    const [ledgerRow] = await conn.db.select().from(movements).where(eq(movements.id, adjustment.movementId));
    expect(ledgerRow).toMatchObject({ kind: "Ajuste Stock", quantity: 10, notes: "Stock inicial", productId: beer.id });
  });

  it("rolls back every module when the work fails after all writes", async () => {
    const before = await getCashBalance(cashDeps)(sessionId);
    await expect(
      uow.run(async (repos) => {
        await checkout(repos, "boom");
        throw new Error("sales ledger failed");
      }),
    ).rejects.toThrow("sales ledger failed");
    expect(await countProducts("boom")).toBe(0);
    expect(await getCashBalance(cashDeps)(sessionId)).toBe(before);
    const strayCategory = await conn.db.select().from(productCategories).where(eq(productCategories.name, n("Checkout")));
    expect(strayCategory).toHaveLength(1); // from the committed test only: the rolled-back run created nothing extra
  });

  it("rolls back when a LATER module rejects (cash refuses a negative balance after stock was consumed)", async () => {
    const stockRowsBefore = (await conn.db.select({ id: stockMovements.id }).from(stockMovements)).length;
    await expect(
      uow.run(async (repos) => {
        const catalog = createCatalogService(repos.catalog, runtime);
        const inventory = createInventoryService(repos.inventory, runtime);
        const { product } = await catalog.createProduct({ name: n("late agua"), categoryName: n("Checkout"), initialStock: 5, actorId });
        const lateMovementId = randomUUID();
        await repos.ledger.movements.insert(stubSale(lateMovementId, product.id, product.name));
        await inventory.consumeSaleStock({ movementId: lateMovementId, productId: product.id, quantity: 1, actorId });
        // A refund bigger than the cash in the drawer: the cash domain rejects it.
        await repos.cash.movements.insert(
          buildCashMovement({
            id: randomUUID(), sessionId, actor: actorId, type: "SALE_REFUND", amount: 999_999_999_999, sign: -1,
            description: "x", reason: "x", previousBalance: await repos.cash.movements.balance(sessionId), now: new Date(),
          }),
        );
      }),
    ).rejects.toThrow("El movimiento dejaría la caja con efectivo negativo.");
    expect(await countProducts("late")).toBe(0);
    expect((await conn.db.select({ id: stockMovements.id }).from(stockMovements)).length).toBe(stockRowsBefore);
  });

  it("an invalid recipe component aborts the whole product creation (no half-created product)", async () => {
    await expect(
      uow.run(async (repos) => {
        const catalog = createCatalogService(repos.catalog, runtime);
        const { product: base } = await catalog.createProduct({ name: n("rec jarabe"), categoryName: n("Checkout"), stockUnit: "ml", isSupply: true, actorId });
        await catalog.createProduct({
          name: n("rec trago"), categoryName: n("Checkout"), actorId,
          recipe: [{ componentId: base.id, quantity: 1, unit: "kg" }],
        });
      }),
    ).rejects.toThrow("No se puede convertir kg a ml: pertenecen a magnitudes distintas.");
    expect(await countProducts("rec")).toBe(0);
  });
});
