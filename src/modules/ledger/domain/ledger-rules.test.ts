import { describe, expect, it } from "vitest";
import {
  LedgerError,
  LedgerPermissionError,
  assertAdmin,
  buildTicketId,
  cashReversalKind,
  isCashPaymentMethod,
  isValidBusinessDate,
  lineAmount,
  nextOrderState,
  requireReason,
} from "./index";

describe("lineAmount", () => {
  it("rounds quantity x unit price to integer cents", () => {
    expect(lineAmount(2, 150_000)).toBe(300_000);
    expect(lineAmount(0.5, 99_999)).toBe(50_000);
    expect(lineAmount(1.5, 333)).toBe(500);
    expect(lineAmount(0.0667, 100_000)).toBe(6_670);
  });
});

describe("buildTicketId", () => {
  it("is YYYYMMDD-XXXXXX (6 upper-case hex chars of the unique token)", () => {
    expect(buildTicketId("2026-08-30", "ab12cd34-0000-4000-8000-000000000000")).toBe("20260830-AB12CD");
  });
});

describe("nextOrderState", () => {
  it("voids the order (total 0) when no active sale line is left", () => {
    expect(nextOrderState({ activeCount: 0, activeTotal: 0 })).toEqual({ status: "VOIDED", total: 0 });
  });
  it("keeps it confirmed with the total of the remaining lines", () => {
    expect(nextOrderState({ activeCount: 1, activeTotal: 250_000 })).toEqual({ status: "CONFIRMED", total: 250_000 });
  });
});

describe("cash helpers", () => {
  it("recognizes the cash payment method by its code", () => {
    expect(isCashPaymentMethod("EFECTIVO")).toBe(true);
    expect(isCashPaymentMethod("NAVE")).toBe(false);
  });
  it("maps ledger kinds to the cash reversal kinds", () => {
    expect(cashReversalKind("Venta")).toBe("sale");
    expect(cashReversalKind("Gasto")).toBe("expense");
    expect(cashReversalKind("Compra")).toBe("purchase");
    expect(cashReversalKind("Ajuste Stock")).toBe("other");
  });
});

describe("validations", () => {
  it("requires a trimmed, non-empty reason with the caller's message", () => {
    expect(requireReason("  duplicado ", "El motivo es obligatorio.")).toBe("duplicado");
    expect(() => requireReason("   ", "El motivo es obligatorio.")).toThrow(new LedgerError("El motivo es obligatorio."));
  });
  it("assertAdmin rejects cashiers with the legacy permission message", () => {
    expect(() => assertAdmin({ id: "u", role: "cashier" })).toThrow(LedgerPermissionError);
    expect(() => assertAdmin({ id: "u", role: "cashier" })).toThrow("No tenés permisos para acceder a esta función.");
    expect(() => assertAdmin({ id: "u", role: "admin" })).not.toThrow();
  });
  it("validates calendar dates", () => {
    expect(isValidBusinessDate("2026-02-28")).toBe(true);
    expect(isValidBusinessDate("2026-02-30")).toBe(false);
    expect(isValidBusinessDate("30/08/2026")).toBe(false);
  });
});
