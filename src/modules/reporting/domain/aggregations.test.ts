import { describe, expect, it } from "vitest";
import {
  buildStockReport,
  expensesByCategory,
  monthStartOf,
  salesByDay,
  salesByPaymentMethod,
  summarizeMovements,
  summarizeTickets,
  type ReportMovement,
  type StockReportProduct,
} from "./index";

let seq = 0;
function movement(over: Partial<ReportMovement> & Pick<ReportMovement, "kind" | "amount">): ReportMovement {
  seq += 1;
  return {
    id: `m-${seq}`,
    number: seq,
    businessDate: "2026-08-30",
    category: null,
    description: "x",
    productName: null,
    quantity: 1,
    unitPrice: over.amount,
    paymentMethod: "Efectivo",
    supplier: "",
    notes: "",
    createdByUsername: "admin",
    createdAt: new Date("2026-08-30T15:00:00Z"),
    voided: false,
    voidReason: null,
    ticketId: null,
    ...over,
  };
}

describe("summarizeMovements (resumen_periodo)", () => {
  it("sales - (expenses + purchases) = result; margin = result / sales; stock adjustments count for nothing", () => {
    const rows = [
      movement({ kind: "Venta", amount: 100_000 }),
      movement({ kind: "Venta", amount: 50_000 }),
      movement({ kind: "Gasto", amount: 30_000 }),
      movement({ kind: "Compra", amount: 20_000 }),
      movement({ kind: "Ajuste Stock", amount: 0 }),
    ];
    expect(summarizeMovements(rows)).toEqual({ movements: rows, sales: 150_000, expenses: 50_000, result: 100_000, margin: 100_000 / 150_000 });
  });

  it("an empty period is all zeros (margin 0, no division by zero)", () => {
    expect(summarizeMovements([])).toEqual({ movements: [], sales: 0, expenses: 0, result: 0, margin: 0 });
    expect(summarizeMovements([movement({ kind: "Gasto", amount: 10_000 })])).toMatchObject({ sales: 0, expenses: 10_000, result: -10_000, margin: 0 });
  });
});

describe("dashboard groupings", () => {
  const rows = [
    movement({ kind: "Venta", amount: 100_000, paymentMethod: "Transferencia", businessDate: "2026-08-02" }),
    movement({ kind: "Venta", amount: 40_000, paymentMethod: "Efectivo", businessDate: "2026-08-02" }),
    movement({ kind: "Venta", amount: 60_000, paymentMethod: "Efectivo", businessDate: "2026-08-01" }),
    movement({ kind: "Gasto", amount: 30_000, category: "Servicios", paymentMethod: "Efectivo" }),
    movement({ kind: "Compra", amount: 90_000, category: "Compra bebida", paymentMethod: "Transferencia" }),
    movement({ kind: "Compra", amount: 10_000, category: "Servicios", paymentMethod: "Transferencia" }),
    movement({ kind: "Gasto", amount: 5_000, category: null }),
  ];

  it("sales by payment method are alphabetical by method and ignore non-sales", () => {
    expect(salesByPaymentMethod(rows)).toEqual([
      { paymentMethod: "Efectivo", amount: 100_000 },
      { paymentMethod: "Transferencia", amount: 100_000 },
    ]);
  });

  it("sales by day are chronological", () => {
    expect(salesByDay(rows)).toEqual([
      { date: "2026-08-01", amount: 60_000 },
      { date: "2026-08-02", amount: 140_000 },
    ]);
  });

  it("expenses by category (Gasto + Compra) are sorted by amount desc and skip rows without category", () => {
    expect(expensesByCategory(rows)).toEqual([
      { category: "Compra bebida", amount: 90_000 },
      { category: "Servicios", amount: 40_000 },
    ]);
  });
});

describe("monthStartOf", () => {
  it("is the first day of the business date's month", () => {
    expect(monthStartOf("2026-08-30")).toBe("2026-08-01");
  });
});

describe("buildStockReport (Stock tab)", () => {
  const product = (over: Partial<StockReportProduct> & Pick<StockReportProduct, "name">): StockReportProduct => ({
    number: 1,
    categoryName: "Bebidas",
    stock: 5,
    minStock: 2,
    salePrice: 100_000,
    unitCost: 40_000,
    ...over,
  });

  it("flags stock <= minimum as Crítico (equal counts), lists critical first then by stock ascending", () => {
    const report = buildStockReport([
      product({ name: "Abundante", number: 1, stock: 50, minStock: 5 }),
      product({ name: "Justo", number: 2, stock: 2, minStock: 2 }),
      product({ name: "Poco", number: 3, stock: 1, minStock: 4 }),
      product({ name: "Normal", number: 4, stock: 8, minStock: 5 }),
    ]);
    expect(report.products.map((p) => [p.name, p.status])).toEqual([
      ["Poco", "Crítico"],
      ["Justo", "Crítico"],
      ["Normal", "OK"],
      ["Abundante", "OK"],
    ]);
    expect(report).toMatchObject({ isEmpty: false, activeProducts: 4, criticalCount: 2 });
  });

  it("unit margin = price - cost; average over all active products, rounded to cents", () => {
    const report = buildStockReport([
      product({ name: "A", number: 1, salePrice: 100_000, unitCost: 40_000 }),
      product({ name: "B", number: 2, salePrice: 50_001, unitCost: 0 }),
    ]);
    expect(report.products.find((p) => p.name === "A")?.unitMargin).toBe(60_000);
    expect(report.averageUnitMargin).toBe(Math.round((60_000 + 50_001) / 2));
  });

  it("recipe products (stock 0, minimum 0) are Crítico like the legacy formula says", () => {
    expect(buildStockReport([product({ name: "Combo", stock: 0, minStock: 0 })]).products[0].status).toBe("Crítico");
  });

  it("no products -> empty report", () => {
    expect(buildStockReport([])).toEqual({ isEmpty: true, activeProducts: 0, criticalCount: 0, averageUnitMargin: 0, products: [] });
  });
});

describe("summarizeTickets (cashier home)", () => {
  it("sums totals, counts tickets and averages per ticket (rounded to cents)", () => {
    const tickets = [
      { ticketId: "A", createdAt: new Date(), time: "10:00:00", total: 100_000, items: 2 },
      { ticketId: "B", createdAt: new Date(), time: "11:00:00", total: 50_001, items: 1 },
    ];
    expect(summarizeTickets(tickets)).toEqual({ sales: 150_001, ticketCount: 2, averageTicket: Math.round(150_001 / 2) });
    expect(summarizeTickets([])).toEqual({ sales: 0, ticketCount: 0, averageTicket: 0 });
  });
});
