import { beforeEach, describe, expect, it } from "vitest";
import type { ReportMovement } from "../domain";
import { makeReportingTestDeps } from "./testing/in-memory";
import { reportingUseCases } from "./index";

let t: ReturnType<typeof makeReportingTestDeps>;
let reporting: ReturnType<typeof reportingUseCases>;
let n = 0;

function add(over: Partial<ReportMovement> & Pick<ReportMovement, "kind" | "amount" | "businessDate">): ReportMovement {
  n += 1;
  const row: ReportMovement = {
    id: `m-${n}`, number: n, category: null, description: `mov ${n}`, productName: null, quantity: 1, unitPrice: over.amount,
    paymentMethod: "Efectivo", supplier: "", notes: "", createdByUsername: "admin", createdAt: new Date("2026-08-30T15:00:00Z"),
    voided: false, voidReason: null, ticketId: null, ...over,
  };
  t.store.movements.push(row);
  return row;
}

beforeEach(() => {
  n = 0;
  t = makeReportingTestDeps();
  reporting = reportingUseCases(t.deps);
});

describe("getPeriodSummary", () => {
  it("summarizes the active movements of an inclusive date range and ignores voided ones", async () => {
    add({ kind: "Venta", amount: 100_000, businessDate: "2026-08-29" });
    add({ kind: "Venta", amount: 500_000, businessDate: "2026-08-29", voided: true });
    add({ kind: "Gasto", amount: 40_000, businessDate: "2026-08-30", category: "Servicios" });
    add({ kind: "Venta", amount: 999, businessDate: "2026-08-31" });
    const day = await reporting.getPeriodSummary({ from: "2026-08-29", to: "2026-08-30" });
    expect(day).toMatchObject({ sales: 100_000, expenses: 40_000, result: 60_000, margin: 0.6 });
    expect(day.movements).toHaveLength(2);
    const open = await reporting.getPeriodSummary({ from: "2026-08-30" });
    expect(open).toMatchObject({ sales: 999, expenses: 40_000 });
  });
});

describe("getAdminDashboard", () => {
  it("builds the Hoy / Mes actual / Stock tabs from the business date", async () => {
    // today (2026-08-30)
    add({ kind: "Venta", amount: 300_000, businessDate: "2026-08-30", paymentMethod: "Transferencia" });
    add({ kind: "Venta", amount: 100_000, businessDate: "2026-08-30", paymentMethod: "Efectivo" });
    add({ kind: "Compra", amount: 150_000, businessDate: "2026-08-30", category: "Compra bebida", paymentMethod: "Efectivo" });
    // earlier this month
    add({ kind: "Venta", amount: 200_000, businessDate: "2026-08-10", paymentMethod: "Efectivo" });
    add({ kind: "Gasto", amount: 50_000, businessDate: "2026-08-05", category: "Servicios" });
    // previous month: excluded from both
    add({ kind: "Venta", amount: 777_000, businessDate: "2026-07-31" });
    t.store.products.push(
      { number: 1, name: "Cerveza", categoryName: "Bebidas", stock: 1, minStock: 5, salePrice: 500_000, unitCost: 200_000 },
      { number: 2, name: "Agua", categoryName: "Bebidas", stock: 20, minStock: 5, salePrice: 150_000, unitCost: 50_000 },
    );

    const dashboard = await reporting.getAdminDashboard();
    expect(dashboard.businessDate).toBe("2026-08-30");
    expect(dashboard.today).toMatchObject({
      date: "2026-08-30", sales: 400_000, expenses: 150_000, result: 250_000, margin: 250_000 / 400_000, isEmpty: false,
      salesByPaymentMethod: [{ paymentMethod: "Efectivo", amount: 100_000 }, { paymentMethod: "Transferencia", amount: 300_000 }],
    });
    expect(dashboard.today.recentMovements).toHaveLength(3);
    expect(dashboard.month).toMatchObject({ from: "2026-08-01", sales: 600_000, expenses: 200_000, result: 400_000, isEmpty: false });
    expect(dashboard.month.salesByDay).toEqual([
      { date: "2026-08-10", amount: 200_000 },
      { date: "2026-08-30", amount: 400_000 },
    ]);
    expect(dashboard.month.expensesByCategory).toEqual([
      { category: "Compra bebida", amount: 150_000 },
      { category: "Servicios", amount: 50_000 },
    ]);
    expect(dashboard.stock).toMatchObject({ activeProducts: 2, criticalCount: 1, averageUnitMargin: 200_000 });
    expect(dashboard.stock.products[0]).toMatchObject({ name: "Cerveza", status: "Crítico", unitMargin: 300_000 });
  });

  it("limits the recent lists to 12 (today) and 20 (month), newest first", async () => {
    for (let i = 0; i < 25; i += 1) add({ kind: "Venta", amount: 1_000, businessDate: "2026-08-30" });
    const dashboard = await reporting.getAdminDashboard();
    expect(dashboard.today.recentMovements).toHaveLength(12);
    expect(dashboard.today.recentMovements[0].number).toBe(25);
    expect(dashboard.month.recentMovements).toHaveLength(20);
  });

  it("reports empty tabs when there is nothing", async () => {
    const dashboard = await reporting.getAdminDashboard();
    expect(dashboard.today).toMatchObject({ isEmpty: true, sales: 0, margin: 0, salesByPaymentMethod: [], recentMovements: [] });
    expect(dashboard.month.isEmpty).toBe(true);
    expect(dashboard.stock.isEmpty).toBe(true);
  });
});

describe("cashier reads", () => {
  beforeEach(() => {
    t.store.tickets.push(
      { ticketId: "T-1", userId: "c1", businessDate: "2026-08-30", createdAt: new Date("2026-08-30T15:05:09Z"), total: 100_000, items: 2 },
      { ticketId: "T-2", userId: "c1", businessDate: "2026-08-30", createdAt: new Date("2026-08-30T18:00:00Z"), total: 50_001, items: 1 },
      { ticketId: "T-3", userId: "c2", businessDate: "2026-08-30", createdAt: new Date("2026-08-30T18:00:00Z"), total: 9, items: 1 },
    );
    t.store.lines.push({ ticketId: "T-1", userId: "c1", productName: "Cerveza", quantity: 2, unitPrice: 50_000, amount: 100_000 });
  });

  it("lists the user's tickets of a date, newest first, with the business-timezone hour", async () => {
    const tickets = await reporting.listUserTickets({ userId: "c1" });
    expect(tickets.map((x) => x.ticketId)).toEqual(["T-2", "T-1"]);
    expect(tickets[1].time).toBe("12:05:09"); // 15:05:09Z is 12:05:09 in Buenos Aires
    expect(await reporting.listUserTickets({ userId: "c1", businessDate: "2026-08-29" })).toEqual([]);
  });

  it("cashier home aggregates sales, ticket count and average ticket", async () => {
    const home = await reporting.getCashierHome({ userId: "c1" });
    expect(home).toMatchObject({ businessDate: "2026-08-30", sales: 150_001, ticketCount: 2, averageTicket: Math.round(150_001 / 2) });
    expect(home.tickets).toHaveLength(2);
  });

  it("returns a ticket's lines only for its owner", async () => {
    expect(await reporting.getTicketDetail({ ticketId: "T-1", userId: "c1" })).toEqual([{ productName: "Cerveza", quantity: 2, unitPrice: 50_000, amount: 100_000 }]);
    expect(await reporting.getTicketDetail({ ticketId: "T-1", userId: "c2" })).toEqual([]);
  });
});

describe("history + lookups", () => {
  it("lists movements for a period with or without voided rows and finds one by its number", async () => {
    add({ kind: "Venta", amount: 1_000, businessDate: "2026-08-20" });
    add({ kind: "Venta", amount: 2_000, businessDate: "2026-08-21", voided: true, voidReason: "x" });
    expect(await reporting.listMovements({ from: "2026-08-01", to: "2026-08-31", includeVoided: false })).toHaveLength(1);
    expect(await reporting.listMovements({ from: "2026-08-01", to: "2026-08-31", includeVoided: true })).toHaveLength(2);
    expect((await reporting.findMovementByNumber(2))?.voidReason).toBe("x");
    expect(await reporting.findMovementByNumber(99)).toBeNull();
  });

  it("tells whether any cash session is open", async () => {
    expect(await reporting.hasAnyOpenCashSession()).toBe(false);
    t.store.openSessions = 1;
    expect(await reporting.hasAnyOpenCashSession()).toBe(true);
  });
});

describe("getCashAdminOverview", () => {
  it("sums the cash of the open sessions and takes today's sales from the business date", async () => {
    t.store.cashAdminOpenSessions.push(
      { id: "s2", number: 2, openedBy: "cajero", businessDate: "2026-08-30", openedAt: new Date("2026-08-30T12:00:00Z"), cashAvailable: 250_000 },
      { id: "s1", number: 1, openedBy: "admin", businessDate: "2026-08-30", openedAt: new Date("2026-08-30T11:00:00Z"), cashAvailable: 100_000 },
    );
    t.store.daySales["2026-08-30"] = { sales: 900_000, tickets: 3 };
    t.store.daySales["2026-08-29"] = { sales: 1, tickets: 1 };

    const overview = await reporting.getCashAdminOverview();
    expect(overview).toMatchObject({
      businessDate: "2026-08-30",
      cashAvailable: 350_000,
      today: { sales: 900_000, tickets: 3 },
    });
    expect(overview.openSessions.map((s) => s.number)).toEqual([2, 1]);
  });

  it("is empty and zeroed when nothing happened yet", async () => {
    const overview = await reporting.getCashAdminOverview();
    expect(overview).toMatchObject({ cashAvailable: 0, today: { sales: 0, tickets: 0 }, openSessions: [], ledger: [], history: [], events: [] });
  });

  it("asks the reader for the legacy list limits (300 ledger rows, 100 sessions, 200 events)", async () => {
    await reporting.getCashAdminOverview();
    expect(t.store.calls).toEqual(expect.arrayContaining(["ledger:300", "history:100", "events:200"]));
  });
});
