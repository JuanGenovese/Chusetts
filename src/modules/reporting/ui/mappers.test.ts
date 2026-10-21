import { describe, expect, it } from "vitest";
import type { ReportMovement, StockReportRow } from "../domain";
import { auditEventRecord, historyRecord, ledgerRecord, monthRecord, openSessionRecord, sessionHistoryRecord, stockRecord, todayRecord } from "./mappers";

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
  paymentMethod: "Mercado Pago",
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
        { label: "Medio", value: "Mercado Pago" },
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

describe("historyRecord", () => {
  it("maps the legacy history columns, with the confirmed / voided state", () => {
    expect(historyRecord(movement({ number: 9 }))).toEqual({
      key: "history-m1",
      title: "Pizza muzza",
      subtitle: "2026-10-19 · Venta · Venta mostrador",
      fields: [
        { label: "Importe", value: "$ 7.800" },
        { label: "Medio de pago", value: "Mercado Pago" },
        { label: "Producto", value: "Pizza muzza" },
        { label: "Usuario", value: "admin" },
        { label: "Estado", value: "Confirmado" },
        { label: "Ticket", value: "20261019-210360" },
      ],
    });
    expect(historyRecord(movement({ voided: true })).fields).toContainEqual({ label: "Estado", value: "Anulado" });
  });

  it("hides empty fields", () => {
    const record = historyRecord(movement({ category: null, productName: null, paymentMethod: null, ticketId: null }));
    expect(record.subtitle).toBe("2026-10-19 · Venta");
    expect(record.fields.map((f) => f.label)).toEqual(["Importe", "Usuario", "Estado"]);
  });
});

describe("cash admin records", () => {
  const at = new Date("2026-10-19T21:00:00Z"); // 18:00:00 in Buenos Aires

  it("open session: 'Caja #n', user · date, opening time and cash", () => {
    expect(openSessionRecord({ id: "s1", number: 4, openedBy: "cajero", businessDate: "2026-10-19", openedAt: at, cashAvailable: 123_400 })).toEqual({
      key: "sessions-s1",
      title: "Caja #4",
      subtitle: "cajero · 2026-10-19",
      fields: [
        { label: "Apertura", value: "2026-10-19 18:00:00" },
        { label: "Efectivo", value: "$ 1.234" },
      ],
    });
  });

  it("ledger row: humanized type, signed amount, balance and reason (empty reason hidden)", () => {
    const entry = { id: "c1", sessionNumber: 4, occurredAt: at, responsible: "cajero", type: "WITHDRAWAL", description: "Retiro", reason: "", amount: 50_000, sign: -1, balanceAfter: 70_000, actor: "admin" };
    expect(ledgerRecord(entry)).toEqual({
      key: "ledger-c1",
      title: "Retiro",
      subtitle: "2026-10-19 18:00:00 · cajero · admin",
      fields: [
        { label: "Monto", value: "− $ 500" },
        { label: "Saldo", value: "$ 700" },
      ],
    });
    expect(ledgerRecord({ ...entry, reason: "Pago proveedor" }).fields.at(-1)).toEqual({ label: "Motivo", value: "Pago proveedor" });
  });

  it("session history: status subtitle and close data only when closed", () => {
    const open = sessionHistoryRecord({ id: "s1", number: 4, businessDate: "2026-10-19", openedBy: "cajero", status: "OPEN", openedAt: at, closedAt: null, difference: null });
    expect(open.subtitle).toBe("2026-10-19 · cajero · ABIERTO");
    expect(open.fields).toEqual([{ label: "Apertura", value: "2026-10-19 18:00:00" }]);
    const closed = sessionHistoryRecord({ id: "s2", number: 3, businessDate: "2026-10-18", openedBy: "cajero", status: "CLOSED", openedAt: at, closedAt: at, difference: -20_000 });
    expect(closed.subtitle).toBe("2026-10-18 · cajero · CERRADO");
    expect(closed.fields.map((f) => f.label)).toEqual(["Apertura", "Cierre", "Diferencia"]);
    expect(closed.fields[2].value).toBe("$ -200");
  });

  it("audit event: 'CODE · Caja #n' with the readable detail", () => {
    expect(auditEventRecord({ id: "e1", sessionNumber: 4, type: "OPENING", actor: "cajero", occurredAt: at, detail: { openingCash: 500_000, notes: "" } })).toEqual({
      key: "event-e1",
      title: "APERTURA · Caja #4",
      subtitle: "2026-10-19 18:00:00 · cajero",
      fields: [{ label: "Detalle", value: "Efectivo inicial: $ 5.000" }],
    });
  });
});
