import { describe, expect, it } from "vitest";
import { cashEventCode, cashMovementTitle, formatEventDetail, sessionStatusLabel, signedAmount } from "./cash-admin";

describe("cash admin presentation rules", () => {
  it("titles cash movements like the legacy Spanish codes", () => {
    expect(cashMovementTitle("MANUAL_INCOME")).toBe("Ingreso Manual");
    expect(cashMovementTitle("CASH_SALE")).toBe("Venta Efectivo");
    expect(cashMovementTitle("SALE_REFUND")).toBe("Devolucion Efectivo");
    expect(cashMovementTitle("SOMETHING_NEW")).toBe("SOMETHING_NEW");
  });

  it("signs amounts: minus for negative signs, plus otherwise (including neutral rows)", () => {
    expect(signedAmount(-1, 150_000)).toBe("− $ 1.500");
    expect(signedAmount(1, 150_000)).toBe("+ $ 1.500");
    expect(signedAmount(0, 150_000)).toBe("+ $ 1.500");
  });

  it("maps event codes and session status to the legacy labels", () => {
    expect(cashEventCode("OPENING")).toBe("APERTURA");
    expect(cashEventCode("CLOSING")).toBe("CIERRE");
    expect(sessionStatusLabel("OPEN")).toBe("ABIERTO");
    expect(sessionStatusLabel("CLOSED")).toBe("CERRADO");
  });

  it("formats the audit detail: money in pesos, empty notes dropped", () => {
    expect(formatEventDetail({ openingCash: 500_000, notes: "" })).toBe("Efectivo inicial: $ 5.000");
    expect(formatEventDetail({ expectedCash: 100_000, countedCash: 90_000, difference: -10_000, notes: "faltó" })).toBe(
      "Esperado: $ 1.000 · Contado: $ 900 · Diferencia: $ -100 · Notas: faltó",
    );
  });
});
