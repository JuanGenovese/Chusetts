import { describe, expect, it } from "vitest";
import type { ReportMovement, StockReportRow } from "../domain";
import { monthRecord, stockRecord, todayRecord } from "./mappers";

const movement = (overrides: Partial<ReportMovement> = {}): ReportMovement => ({
  id: "m1",
  number: 1,
  businessDate: "2026-10-19",
  kind: "Venta",
  category: "Venta mostrador",
  description: "Pizza muzza",
  productName: "Pizza muzza",
  quantity: 1,
  unitPrice: 780000,
  amount: 780000,
  paymentMethod: "Nave",
  supplier: "",
  notes: "",
  createdByUsername: "admin",
  createdAt: new Date("2026-10-19T21:00:00Z"),
  voided: false,
  voidReason: null,
  ticketId: "20261019-210360",
  ...overrides,
});

describe("todayRecord", () => {
  it("maps the legacy 'Hoy' columns", () => {
    expect(todayRecord(movement())).toEqual({
      key: "today-m1",
      title: "Pizza muzza",
      subtitle: "2026-10-19 · Venta",
      fields: [
        { label: "Importe", value: "$ 7.800" },
        { label: "Medio", value: "Nave" },
        { label: "Ticket", value: "20261019-210360" },
      ],
    });
  });
  it("hides empty fields and falls back to 'Sin nombre'", () => {
    const record = todayRecord(movement({ description: "", ticketId: null, paymentMethod: null }));
    expect(record.title).toBe("Sin nombre");
    expect(record.fields.map((f) => f.label)).toEqual(["Importe"]);
  });
  it("gives identical-looking movements different keys", () => {
    expect(todayRecord(movement({ id: "a" })).key).not.toBe(todayRecord(movement({ id: "b" })).key);
  });
});

describe("monthRecord", () => {
  it("adds the category to the subtitle and the product field", () => {
    const record = monthRecord(movement());
    expect(record.subtitle).toBe("2026-10-19 · Venta · Venta mostrador");
    expect(record.fields.map((f) => f.label)).toEqual(["Importe", "Producto", "Medio"]);
  });
  it("skips the product of an expense", () => {
    const record = monthRecord(movement({ kind: "Gasto", productName: null, category: "Alquiler" }));
    expect(record.fields.map((f) => f.label)).toEqual(["Importe", "Medio"]);
  });
});

describe("stockRecord", () => {
  const row: StockReportRow = {
    name: "Botella Fernet",
    categoryName: null,
    stock: 1.7999,
    minStock: 0,
    salePrice: 0,
    unitCost: 0,
    unitMargin: 0,
    status: "OK",
  };
  it("prints stock with Python's :g and omits a missing category", () => {
    const record = stockRecord(row, 3);
    expect(record.subtitle).toBe("OK");
    expect(record.fields[0].value).toBe("1.7999 · mínimo 0");
    expect(record.key).toBe("stock-3");
  });
});
