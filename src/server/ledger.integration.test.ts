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
  suppliers,
  users,
} from "@/shared/infrastructure/db/schema";
import {
  UuidGenerator,
  calculateExpected,
  closeCashSession,
  getCashBalance,
  getSalesSummary,
  openCashSession,
  type CashDeps,
} from "@/modules/cash";
import { createCatalogService } from "@/modules/catalog";
import { ledgerUseCases, type LedgerDeps } from "@/modules/ledger";
import { reportingUseCases, type ReportingDeps } from "@/modules/reporting";
import { buildAppRepositories, type AppRepositories } from "./app-repositories";

const url = process.env.DATABASE_URL;
if (!url) {
  console.warn("[integration] DATABASE_URL is not set: skipping ledger integration tests. Copy .env.local.example to .env.local, run `pnpm supabase:start && pnpm db:migrate`.");
}

/**
 * Business dates far in the future: report queries over them only see this test's rows. The fixture date is in a LATER
 * year than the default one because the "Mes actual" tab is open ended (from the first day of the month).
 */
const randomDay = () => String(1 + Math.floor(Math.random() * 27)).padStart(2, "0");
const randomMonth = () => String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
const TEST_DATE = `2088-${randomMonth()}-${randomDay()}`;
const FIXTURE_DATE = `2099-${randomMonth()}-${randomDay()}`;
/** Its own day, so the "today" totals of the cash overview only see that test's sales. */
const OVERVIEW_DATE = `2097-${randomMonth()}-${randomDay()}`;

describe.skipIf(!url)("ledger + reporting against Postgres (one transaction across ledger, inventory, cash)", () => {
  const tag = randomUUID().slice(0, 8);
  const n = (name: string) => `IT-${tag} ${name}`;
  let currentDate = TEST_DATE;
  const runtime = {
    clock: { now: () => new Date(), businessDate: () => currentDate },
    ids: new UuidGenerator(),
  };
  let conn: DbConnection;
  let uow: ReturnType<typeof drizzleUnitOfWork<AppRepositories>>;
  let cashDeps: CashDeps;
  let ledger: ReturnType<typeof ledgerUseCases>;
  let reporting: ReturnType<typeof reportingUseCases>;
  const createdUsers: string[] = [];
  const createdSessions: string[] = [];
  const createdSuppliers: string[] = [];

  async function newUser(role: "admin" | "cashier") {
    const id = randomUUID();
    await conn.db.insert(users).values({ id, username: `it-${tag}-${id.slice(0, 6)}`, displayName: "Integration", role });
    createdUsers.push(id);
    return { id, role } as const;
  }

  async function openFor(userId: string, openingCash = 1_000_000) {
    const session = await openCashSession(cashDeps)({ userId, openingCash });
    createdSessions.push(session.id);
    return session.id;
  }

  async function newProduct(name: string, over: Partial<Parameters<ReturnType<typeof createCatalogService>["createProduct"]>[0]> = {}) {
    const { product } = await uow.run((repos) =>
      createCatalogService(repos.catalog, runtime).createProduct({
        name: n(name), categoryName: n("Cat"), salePrice: 500_000, actorId: ADMIN_ID, ...over,
      }),
    );
    return product;
  }

  let ADMIN_ID: string;
  const stockOf = async (id: string) => (await conn.db.select().from(stockLevels).where(eq(stockLevels.productId, id)))[0]?.quantity ?? 0;
  const ledgerRows = async (userId: string) => conn.db.select().from(movements).where(eq(movements.createdBy, userId));

  beforeAll(async () => {
    conn = createDbConnection(url!, { max: 8 });
    await seedReferenceData(conn.db);
    uow = drizzleUnitOfWork<AppRepositories>(conn.db, (tx) => buildAppRepositories(tx, runtime));
    cashDeps = { uow: narrowUnitOfWork(uow, (r) => r.cash), ...runtime };
    const ledgerDeps: LedgerDeps = { uow: narrowUnitOfWork(uow, (r) => r.ledger), ...runtime };
    const reportingDeps: ReportingDeps = { uow: narrowUnitOfWork(uow, (r) => r.reporting), clock: runtime.clock };
    ledger = ledgerUseCases(ledgerDeps);
    reporting = reportingUseCases(reportingDeps);
    ADMIN_ID = (await newUser("admin")).id;
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
    if (createdSuppliers.length > 0) await conn.db.delete(suppliers).where(inArray(suppliers.id, createdSuppliers));
    if (createdUsers.length > 0) await conn.db.delete(users).where(inArray(users.id, createdUsers));
    await conn.close();
  });

  it("a cash sale consumes stock and records the cash movement atomically, and the reads see it", async () => {
    const cashier = await newUser("cashier");
    const sessionId = await openFor(cashier.id);
    const beer = await newProduct("Cerveza venta", { initialStock: 10 });

    const { ticketId, movementIds, total } = await ledger.registerSaleTicket({
      actor: cashier, lines: [{ productId: beer.id, quantity: 2 }], paymentMethod: "Efectivo", notes: "mesa 3",
    });

    expect(total).toBe(1_000_000);
    expect(await stockOf(beer.id)).toBe(8);
    const [stockRow] = await conn.db.select().from(stockMovements).where(eq(stockMovements.movementId, movementIds[0]));
    expect(stockRow).toMatchObject({ type: "CONSUMO_VENTA", quantityDelta: -2, productId: beer.id });
    const cashRows = await conn.db.select().from(cashMovements).where(eq(cashMovements.referenceKey, `MOVEMENT:${movementIds[0]}`));
    expect(cashRows).toHaveLength(1);
    expect(cashRows[0]).toMatchObject({ type: "CASH_SALE", amount: 1_000_000, sign: 1, sessionId });
    expect(await getCashBalance(cashDeps)(sessionId)).toBe(2_000_000);

    const [row] = await conn.db.select().from(movements).where(eq(movements.id, movementIds[0]));
    expect(row).toMatchObject({
      kind: "Venta", category: "Venta mostrador", ticketId, businessDate: TEST_DATE, amount: 1_000_000, unitPrice: 500_000,
      paymentMethodName: "Efectivo", notes: "mesa 3", voided: false, cashSessionId: sessionId, createdBy: cashier.id,
    });
    const [order] = await conn.db.select().from(saleOrders).where(eq(saleOrders.ticketId, ticketId));
    expect(order).toMatchObject({ status: "CONFIRMED", total: 1_000_000, businessDate: TEST_DATE, cashSessionId: sessionId });
    expect(row.saleOrderId).toBe(order.id);

    // cash module reads the real ledger now (no more Phase 1 stub)
    expect(await getSalesSummary(cashDeps)(sessionId)).toEqual({ sales: 1_000_000, cashSales: 1_000_000, electronicSales: 0, tickets: 1 });

    // reporting
    const tickets = await reporting.listUserTickets({ userId: cashier.id });
    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({ ticketId, total: 1_000_000, items: 2 });
    expect(tickets[0].time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(await reporting.getTicketDetail({ ticketId, userId: cashier.id })).toEqual([
      { productName: beer.name, quantity: 2, unitPrice: 500_000, amount: 1_000_000 },
    ]);
    expect(await reporting.getTicketDetail({ ticketId, userId: ADMIN_ID })).toEqual([]);
    expect(await reporting.hasAnyOpenCashSession()).toBe(true);
    expect(await reporting.getCashierHome({ userId: cashier.id })).toMatchObject({ sales: 1_000_000, ticketCount: 1, averageTicket: 1_000_000 });
  });

  it("a transfer sale does not touch the drawer but shows up in the expected amounts at closing", async () => {
    const cashier = await newUser("cashier");
    const sessionId = await openFor(cashier.id, 500_000);
    const water = await newProduct("Agua transf", { initialStock: 5, salePrice: 150_000 });
    await ledger.registerSaleTicket({ actor: cashier, lines: [{ productId: water.id, quantity: 3 }], paymentMethod: "Transferencia" });
    expect(await getCashBalance(cashDeps)(sessionId)).toBe(500_000);
    expect(await calculateExpected(cashDeps)(sessionId)).toMatchObject({ cash: 500_000, transfer: 450_000 });
    expect(await getSalesSummary(cashDeps)(sessionId)).toEqual({ sales: 450_000, cashSales: 0, electronicSales: 450_000, tickets: 1 });
  });

  it("insufficient stock on a later line rolls back every row (no partial ticket)", async () => {
    const cashier = await newUser("cashier");
    const sessionId = await openFor(cashier.id);
    const plenty = await newProduct("Abundante", { initialStock: 10 });
    const scarce = await newProduct("Escaso", { initialStock: 1 });
    const before = (await ledgerRows(cashier.id)).length;
    await expect(
      ledger.registerSaleTicket({
        actor: cashier, paymentMethod: "Efectivo",
        lines: [{ productId: plenty.id, quantity: 2 }, { productId: scarce.id, quantity: 5 }],
      }),
    ).rejects.toThrow(/^Stock insuficiente\./);
    expect(await stockOf(plenty.id)).toBe(10);
    expect(await stockOf(scarce.id)).toBe(1);
    expect((await ledgerRows(cashier.id)).length).toBe(before);
    expect(await conn.db.select().from(saleOrders).where(eq(saleOrders.createdBy, cashier.id))).toHaveLength(0);
    expect(await getCashBalance(cashDeps)(sessionId)).toBe(1_000_000);
  });

  it("voiding a ticket gives stock and cash back and voids the order; others' tickets are untouchable for a cashier", async () => {
    const cashier = await newUser("cashier");
    const other = await newUser("cashier");
    const sessionId = await openFor(cashier.id);
    const beer = await newProduct("Cerveza anular", { initialStock: 10 });
    const { ticketId, movementIds } = await ledger.registerSaleTicket({
      actor: cashier, lines: [{ productId: beer.id, quantity: 4 }], paymentMethod: "Efectivo",
    });
    expect(await stockOf(beer.id)).toBe(6);
    await expect(ledger.voidTicket({ actor: other, ticketId, reason: "x" })).rejects.toThrow("No se encontró el ticket o ya estaba anulado.");

    await ledger.voidTicket({ actor: cashier, ticketId, reason: " cliente se fue " });
    expect(await stockOf(beer.id)).toBe(10);
    expect(await getCashBalance(cashDeps)(sessionId)).toBe(1_000_000);
    const [row] = await conn.db.select().from(movements).where(eq(movements.id, movementIds[0]));
    expect(row).toMatchObject({ voided: true, voidReason: "cliente se fue", voidedBy: cashier.id });
    const [order] = await conn.db.select().from(saleOrders).where(eq(saleOrders.ticketId, ticketId));
    expect(order).toMatchObject({ status: "VOIDED", total: 0, voidedBy: cashier.id });
    const refunds = await conn.db.select().from(cashMovements).where(eq(cashMovements.referenceKey, `REVERSAL:${movementIds[0]}`));
    expect(refunds[0]).toMatchObject({ type: "SALE_REFUND", sign: -1, amount: 2_000_000, description: `Anulación: ${beer.name}` });
    const [stockRow] = await conn.db.select().from(stockMovements).where(eq(stockMovements.movementId, movementIds[0]));
    expect(stockRow.reverted).toBe(true);
    expect(await reporting.listUserTickets({ userId: cashier.id })).toEqual([]);
    await expect(ledger.voidTicket({ actor: cashier, ticketId, reason: "x" })).rejects.toThrow("No se encontró el ticket o ya estaba anulado.");
  });

  it("voiding a ticket of a CLOSED cash session is rejected and writes nothing", async () => {
    const cashier = await newUser("cashier");
    const sessionId = await openFor(cashier.id);
    const beer = await newProduct("Cerveza cerrada", { initialStock: 10 });
    const { ticketId, movementIds } = await ledger.registerSaleTicket({
      actor: cashier, lines: [{ productId: beer.id, quantity: 1 }], paymentMethod: "Efectivo",
    });
    await closeCashSession(cashDeps)({ sessionId, actor: cashier.id, countedCash: 1_500_000 });
    const snapshot = async () => ({
      stock: await stockOf(beer.id),
      balance: await getCashBalance(cashDeps)(sessionId),
      cashRows: (await conn.db.select().from(cashMovements).where(eq(cashMovements.sessionId, sessionId))).length,
      movement: (await conn.db.select().from(movements).where(eq(movements.id, movementIds[0])))[0],
      order: (await conn.db.select().from(saleOrders).where(eq(saleOrders.ticketId, ticketId)))[0],
      stockRows: await conn.db.select().from(stockMovements).where(eq(stockMovements.movementId, movementIds[0])),
    });
    const before = await snapshot();
    const message = "No se puede anular: la caja de este ticket ya está cerrada. Registre un ajuste manual en la caja abierta.";
    await expect(ledger.voidTicket({ actor: cashier, ticketId, reason: "x" })).rejects.toThrow(message);
    await expect(ledger.voidMovement({ actor: { id: ADMIN_ID, role: "admin" }, movementId: movementIds[0], reason: "x" })).rejects.toThrow(message);
    expect(await snapshot()).toEqual(before);
    expect(before.movement.voided).toBe(false);
    expect(before.order.status).toBe("CONFIRMED");
  });

  it("a purchase paid in cash raises stock through the purchase factor and takes the cash out", async () => {
    const admin = { id: ADMIN_ID, role: "admin" } as const;
    const sessionId = await openFor(ADMIN_ID, 2_000_000);
    const [supplier] = await conn.db.insert(suppliers).values({ name: n("Proveedor") }).returning();
    createdSuppliers.push(supplier.id);
    const crate = await newProduct("Fernet caja", { stockUnit: "unidad", purchaseFactor: 12, initialStock: 1, isSellable: false, isSupply: true });

    const { movementId } = await ledger.registerPurchase({
      actor: admin, businessDate: TEST_DATE, description: "Fernet x2 cajas", category: "Compra bebida", productId: crate.id,
      supplierId: supplier.id, quantity: 2, unitCost: 100_000, paymentMethod: "Efectivo",
    });
    expect(await stockOf(crate.id)).toBe(25); // 1 + 2 * 12
    const [stockRow] = await conn.db.select().from(stockMovements).where(eq(stockMovements.movementId, movementId));
    expect(stockRow).toMatchObject({ type: "INGRESO_COMPRA", quantityDelta: 24, reason: "Ingreso por compra" });
    expect(await getCashBalance(cashDeps)(sessionId)).toBe(1_800_000);
    const [outflow] = await conn.db.select().from(cashMovements).where(eq(cashMovements.referenceKey, `MOVEMENT:${movementId}`));
    expect(outflow).toMatchObject({ type: "CASH_OUTFLOW", sign: -1, amount: 200_000, description: "Fernet x2 cajas" });
    const [row] = await conn.db.select().from(movements).where(eq(movements.id, movementId));
    expect(row).toMatchObject({ kind: "Compra", supplierId: supplier.id, supplierName: n("Proveedor"), amount: 200_000, quantity: 2, unitPrice: 100_000 });
    expect(row.categoryId).not.toBeNull();

    // paying more cash than the drawer holds rolls the stock intake back too
    await expect(
      ledger.registerPurchase({
        actor: admin, businessDate: TEST_DATE, description: "Demasiado", category: "Compra bebida", productId: crate.id,
        quantity: 100, unitCost: 100_000, paymentMethod: "Efectivo",
      }),
    ).rejects.toThrow("El movimiento dejaría la caja con efectivo negativo.");
    expect(await stockOf(crate.id)).toBe(25);
    expect(await getCashBalance(cashDeps)(sessionId)).toBe(1_800_000);

    // voiding the purchase reverses the stock and gives the cash back
    await ledger.voidMovement({ actor: admin, movementId, reason: "carga duplicada" });
    expect(await stockOf(crate.id)).toBe(1);
    expect(await getCashBalance(cashDeps)(sessionId)).toBe(2_000_000);
    const [reversal] = await conn.db.select().from(cashMovements).where(eq(cashMovements.referenceKey, `REVERSAL:${movementId}`));
    expect(reversal).toMatchObject({ type: "OUTFLOW_REVERSAL", sign: 1, amount: 200_000 });
  });

  it("stock adjustments are booked in the ledger first and can be voided", async () => {
    const admin = { id: ADMIN_ID, role: "admin" } as const;
    const beer = await newProduct("Ajustable", { initialStock: 10 });
    const result = await ledger.adjustStock({ actor: admin, productId: beer.id, countedStock: 7, reason: "Conteo" });
    expect(await stockOf(beer.id)).toBe(7);
    const [row] = await conn.db.select().from(movements).where(eq(movements.id, result.movementId));
    expect(row).toMatchObject({ kind: "Ajuste Stock", quantity: -3, description: `Ajuste físico: ${beer.name}`, notes: "Conteo", amount: 0, businessDate: TEST_DATE });
    await ledger.voidMovement({ actor: admin, movementId: result.movementId, reason: "error" });
    expect(await stockOf(beer.id)).toBe(10);
    await expect(ledger.adjustStock({ actor: { id: ADMIN_ID, role: "cashier" }, productId: beer.id, countedStock: 1, reason: "x" })).rejects.toThrow(
      "No tenés permisos para acceder a esta función.",
    );
  });

  it("the stock audit trail is protected by a foreign key to the ledger", async () => {
    const beer = await newProduct("FK", { initialStock: 1 });
    await expect(
      conn.db.insert(stockMovements).values({
        movementId: randomUUID(), productId: beer.id, quantityDelta: 1, type: "X", reason: "x", stockBefore: 0, stockAfter: 1,
        actorId: ADMIN_ID, referenceType: "X", referenceId: "x", createdAt: new Date(),
      }),
    ).rejects.toThrow();
  });

  it("two cashiers racing for the last unit: exactly one sale succeeds and only one cash movement exists", async () => {
    const a = await newUser("cashier");
    const b = await newUser("cashier");
    const sessionA = await openFor(a.id, 0);
    const sessionB = await openFor(b.id, 0);
    const last = await newProduct("Última unidad", { initialStock: 1 });
    const results = await Promise.allSettled(
      [a, b].map((actor) => ledger.registerSaleTicket({ actor, lines: [{ productId: last.id, quantity: 1 }], paymentMethod: "Efectivo" })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason.message).toMatch(/^Stock insuficiente\./);
    expect(await stockOf(last.id)).toBe(0);
    const balances = [await getCashBalance(cashDeps)(sessionA), await getCashBalance(cashDeps)(sessionB)].sort();
    expect(balances).toEqual([0, 500_000]);
    expect((await ledgerRows(a.id)).length + (await ledgerRows(b.id)).length).toBe(1);
  });

  it("summary numbers match a hand-computed fixture (voided rows and stock adjustments excluded)", async () => {
    currentDate = FIXTURE_DATE;
    try {
      const admin = { id: ADMIN_ID, role: "admin" } as const;
      const cashier = await newUser("cashier");
      const sessionId = await openFor(cashier.id, 100_000);
      const beer = await newProduct("Fixture cerveza", { initialStock: 20, salePrice: 500_000 });
      const water = await newProduct("Fixture agua", { initialStock: 20, salePrice: 150_000 });
      // sales: 2 x $5000 cash = $10000 ; 3 x $1500 transfer = $4500 ; 1 x $1500 transfer (voided afterwards)
      await ledger.registerSaleTicket({ actor: cashier, lines: [{ productId: beer.id, quantity: 2 }], paymentMethod: "Efectivo" });
      await ledger.registerSaleTicket({ actor: cashier, lines: [{ productId: water.id, quantity: 3 }], paymentMethod: "Transferencia" });
      const voided = await ledger.registerSaleTicket({ actor: cashier, lines: [{ productId: water.id, quantity: 1 }], paymentMethod: "Transferencia" });
      await ledger.voidTicket({ actor: cashier, ticketId: voided.ticketId, reason: "error" });
      // expenses: gasto $1200 "Servicios" + compra 20 x $100 = $2000 "Compra bebida" (both by transfer)
      await ledger.registerExpense({ actor: admin, businessDate: FIXTURE_DATE, description: "Luz", category: "Servicios", amount: 120_000, paymentMethod: "Transferencia" });
      await ledger.registerPurchase({
        actor: admin, businessDate: FIXTURE_DATE, description: "Cerveza x20", category: "Compra bebida", productId: beer.id,
        quantity: 20, unitCost: 10_000, paymentMethod: "Transferencia",
      });
      // a stock adjustment: a ledger row with amount 0 that must not change any total
      await ledger.adjustStock({ actor: admin, productId: water.id, countedStock: 5, reason: "Conteo" });

      const summary = await reporting.getPeriodSummary({ from: FIXTURE_DATE, to: FIXTURE_DATE });
      // 2 sales + gasto + compra + 3 "Ajuste Stock" (2 initial stocks + the adjustment); the voided sale is out
      expect(summary.movements).toHaveLength(7);
      expect(summary).toMatchObject({ sales: 1_450_000, expenses: 320_000, result: 1_130_000, margin: 1_130_000 / 1_450_000 });
      expect(summary.movements.map((m) => m.kind).sort()).toEqual(["Ajuste Stock", "Ajuste Stock", "Ajuste Stock", "Compra", "Gasto", "Venta", "Venta"]);
      expect(summary.movements[0].number).toBeGreaterThan(summary.movements[6].number); // newest first
      expect(await reporting.getPeriodSummary({ from: FIXTURE_DATE, to: FIXTURE_DATE })).toEqual(summary);
      expect(await reporting.getPeriodSummary({ from: "2099-12-31" })).toMatchObject({ sales: 0, expenses: 0, margin: 0 });

      const history = await reporting.listMovements({ from: FIXTURE_DATE, to: FIXTURE_DATE, includeVoided: true });
      expect(history).toHaveLength(8);
      const voidedRow = history.find((m) => m.voided)!;
      expect(voidedRow).toMatchObject({ kind: "Venta", amount: 150_000, voidReason: "error", paymentMethod: "Transferencia" });
      expect((await reporting.findMovementByNumber(voidedRow.number))?.id).toBe(voidedRow.id);

      const dashboard = await reporting.getAdminDashboard();
      expect(dashboard.businessDate).toBe(FIXTURE_DATE);
      expect(dashboard.today).toMatchObject({ sales: 1_450_000, expenses: 320_000, result: 1_130_000, isEmpty: false });
      expect(dashboard.today.salesByPaymentMethod).toEqual([
        { paymentMethod: "Efectivo", amount: 1_000_000 },
        { paymentMethod: "Transferencia", amount: 450_000 },
      ]);
      expect(dashboard.today.recentMovements).toHaveLength(7);
      expect(dashboard.month).toMatchObject({ from: `${FIXTURE_DATE.slice(0, 8)}01`, sales: 1_450_000, expenses: 320_000, result: 1_130_000 });
      expect(dashboard.month.salesByDay).toEqual([{ date: FIXTURE_DATE, amount: 1_450_000 }]);
      expect(dashboard.month.expensesByCategory).toEqual([
        { category: "Compra bebida", amount: 200_000 },
        { category: "Servicios", amount: 120_000 },
      ]);
      const stockRow = (name: string) => dashboard.stock.products.find((p) => p.name === n(name))!;
      expect(stockRow("Fixture cerveza")).toMatchObject({ stock: 38, salePrice: 500_000, unitCost: 0, unitMargin: 500_000, status: "OK" });
      expect(stockRow("Fixture agua")).toMatchObject({ stock: 5, status: "OK" });

      // the cash module reads the same ledger: expected amounts of the cashier's session
      expect(await calculateExpected(cashDeps)(sessionId)).toMatchObject({ cash: 1_100_000, transfer: 450_000 });
      expect(await getSalesSummary(cashDeps)(sessionId)).toEqual({ sales: 1_450_000, cashSales: 1_000_000, electronicSales: 450_000, tickets: 2 });

      // voiding one more sale line moves every number
      const extra = await ledger.registerSaleTicket({ actor: cashier, lines: [{ productId: beer.id, quantity: 1 }], paymentMethod: "Transferencia" });
      expect((await reporting.getPeriodSummary({ from: FIXTURE_DATE, to: FIXTURE_DATE })).sales).toBe(1_950_000);
      await ledger.voidTicket({ actor: cashier, ticketId: extra.ticketId, reason: "otra" });
      expect((await reporting.getPeriodSummary({ from: FIXTURE_DATE, to: FIXTURE_DATE })).sales).toBe(1_450_000);
    } finally {
      currentDate = TEST_DATE;
    }
  });
  it("the admin cash overview sees open sessions with their cash, today's sales, the ledger, the history and the audit events", async () => {
    currentDate = OVERVIEW_DATE;
    try {
      const cashier = await newUser("cashier");
      const closer = await newUser("cashier");
      const openSessionId = await openFor(cashier.id, 100_000);
      const closedSessionId = await openFor(closer.id, 50_000);
      const beer = await newProduct("Overview cerveza", { initialStock: 10, salePrice: 500_000 });
      await ledger.registerSaleTicket({ actor: cashier, lines: [{ productId: beer.id, quantity: 2 }], paymentMethod: "Efectivo" });
      const voided = await ledger.registerSaleTicket({ actor: cashier, lines: [{ productId: beer.id, quantity: 1 }], paymentMethod: "Efectivo" });
      await ledger.voidTicket({ actor: cashier, ticketId: voided.ticketId, reason: "error" });
      await closeCashSession(cashDeps)({ sessionId: closedSessionId, actor: closer.id, countedCash: 40_000 });

      const overview = await reporting.getCashAdminOverview();
      const [open, closed] = await Promise.all([
        conn.db.select().from(cashSessions).where(eq(cashSessions.id, openSessionId)),
        conn.db.select().from(cashSessions).where(eq(cashSessions.id, closedSessionId)),
      ]);
      expect(overview.businessDate).toBe(OVERVIEW_DATE);
      // opening 1000 + cash sale 10000 (the voided one is refunded); the closed session is not listed
      const mine = overview.openSessions.find((s) => s.id === openSessionId)!;
      expect(mine).toMatchObject({ number: open[0].number, openedBy: expect.stringContaining(`it-${tag}`), cashAvailable: 1_100_000 });
      expect(overview.openSessions.some((s) => s.id === closedSessionId)).toBe(false);
      expect(overview.cashAvailable).toBeGreaterThanOrEqual(1_100_000);
      // only this test sells on its date: 2 x $5000, the voided ticket is excluded
      expect(overview.today).toEqual({ sales: 1_000_000, tickets: 1 });

      const sessionLedger = overview.ledger.filter((e) => e.sessionNumber === open[0].number);
      expect(sessionLedger.map((e) => e.type)).toEqual(["SALE_REFUND", "CASH_SALE", "CASH_SALE", "OPENING"]); // newest first
      expect(sessionLedger[0]).toMatchObject({ sign: -1, amount: 500_000, responsible: mine.openedBy, actor: mine.openedBy });

      const entry = overview.history.find((h) => h.id === closedSessionId)!;
      expect(entry).toMatchObject({ number: closed[0].number, status: "CLOSED", difference: -10_000 });
      expect(entry.closedAt).toBeInstanceOf(Date);
      expect(overview.history.find((h) => h.id === openSessionId)).toMatchObject({ status: "OPEN", closedAt: null, difference: null });

      const events = overview.events.filter((e) => e.sessionNumber === closed[0].number);
      expect(events.map((e) => e.type)).toEqual(["CLOSING", "OPENING"]);
      expect(events[0].detail).toMatchObject({ countedCash: 40_000, difference: -10_000 });
    } finally {
      currentDate = TEST_DATE;
    }
  });
});
