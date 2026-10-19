import { describe, expect, it } from "vitest";
import {
  CashSessionError,
  PermissionDeniedError,
  assertCanRecordManualMovement,
  buildCashMovement,
  calculateExpectedAmounts,
  closeSession,
  openSession,
  assertSessionOpen,
  assertCashWritable,
  assertVoidAllowed,
  type CashSession,
  type OpenSessionParams,
} from "./index";
import * as domain from "./index";

const now = new Date("2026-08-30T15:00:00Z");

function makeSession(overrides: Partial<OpenSessionParams> = {}): CashSession {
  return openSession({
    id: "s-1",
    openedBy: "u-1",
    openingCash: 5_000_000,
    notes: "",
    businessDate: "2026-08-30",
    now,
    ...overrides,
  });
}

describe("openSession", () => {
  it("creates an OPEN session with trimmed notes", () => {
    const s = makeSession({ notes: "  turno noche  " });
    expect(s.status).toBe("OPEN");
    expect(s.openingCash).toBe(5_000_000);
    expect(s.openingNotes).toBe("turno noche");
    expect(s.closedAt).toBeNull();
  });

  it("rejects a negative opening cash", () => {
    expect(() => makeSession({ openingCash: -1 })).toThrow(CashSessionError);
    expect(() => makeSession({ openingCash: -1 })).toThrow("El efectivo inicial no puede ser negativo.");
  });

  it("rejects non-integer cents", () => {
    expect(() => makeSession({ openingCash: 10.5 })).toThrow(CashSessionError);
  });

  it("requires a user", () => {
    expect(() => makeSession({ openedBy: "  " })).toThrow("El usuario es obligatorio.");
  });
});

describe("buildCashMovement", () => {
  const base = {
    id: "m-1",
    sessionId: "s-1",
    actor: "u-1",
    type: "MANUAL_INCOME" as const,
    amount: 1000,
    sign: 1 as const,
    description: "x",
    reason: "y",
    previousBalance: 500,
    now,
  };

  it("computes previous and posterior balance", () => {
    const m = buildCashMovement(base);
    expect(m.balanceBefore).toBe(500);
    expect(m.balanceAfter).toBe(1500);
  });

  it("sign 0 keeps balance", () => {
    expect(buildCashMovement({ ...base, type: "CLOSING", sign: 0 }).balanceAfter).toBe(500);
  });

  it("rejects negative amounts and invalid signs", () => {
    expect(() => buildCashMovement({ ...base, amount: -1 })).toThrow("El monto no puede ser negativo.");
    expect(() => buildCashMovement({ ...base, sign: 2 as never })).toThrow("Signo de movimiento inválido.");
  });

  it("rejects movements that would leave cash negative", () => {
    expect(() => buildCashMovement({ ...base, sign: -1, amount: 501 })).toThrow(
      "El movimiento dejaría la caja con efectivo negativo.",
    );
    expect(buildCashMovement({ ...base, sign: -1, amount: 500 }).balanceAfter).toBe(0);
  });
});

describe("assertCanRecordManualMovement", () => {
  it("allows only admins", () => {
    expect(() => assertCanRecordManualMovement("admin")).not.toThrow();
    expect(() => assertCanRecordManualMovement("cashier")).toThrow(PermissionDeniedError);
  });
});

describe("calculateExpectedAmounts", () => {
  it("uses the ledger balance for cash and aggregates non-cash totals", () => {
    const expected = calculateExpectedAmounts(7_000_000, [
      { paymentMethod: "mercado_pago", kind: "sale", total: 3_000_000 },
      { paymentMethod: "card", kind: "sale", total: 1_000 },
      { paymentMethod: "card", kind: "expense", total: 400 },
      { paymentMethod: "transfer", kind: "purchase", total: 100 },
    ]);
    expect(expected.cash).toBe(7_000_000);
    expect(expected.mercado_pago).toBe(3_000_000);
    expect(expected.card).toBe(600);
    expect(expected.transfer).toBe(-100);
    expect(expected.other).toBe(0);
  });

  it("maps unknown payment methods to other", () => {
    const expected = calculateExpectedAmounts(0, [{ paymentMethod: "crypto", kind: "sale", total: 50 }]);
    expect(expected.other).toBe(50);
  });
});

describe("closeSession", () => {
  const expected = { cash: 7_000_000, transfer: 0, card: 0, mercado_pago: 3_000_000, other: 0 };

  it("computes the difference (counted - expected) and closes", () => {
    const { session, result } = closeSession(makeSession(), {
      actor: "u-2",
      countedCash: 6_950_000,
      notes: " Faltan 500 ",
      expected,
      now,
    });
    expect(session.status).toBe("CLOSED");
    expect(session.closedBy).toBe("u-2");
    expect(session.difference).toBe(-50_000);
    expect(session.closingNotes).toBe("Faltan 500");
    expect(session.expectedAmounts?.cash).toBe(7_000_000);
    expect(session.countedAmounts?.cash).toBe(6_950_000);
    expect(session.countedAmounts?.mercado_pago).toBe(3_000_000);
    expect(result).toEqual({
      expectedCash: 7_000_000,
      countedCash: 6_950_000,
      difference: -50_000,
      electronicTotal: 3_000_000,
    });
  });

  it("rejects negative counted cash", () => {
    expect(() => closeSession(makeSession(), { actor: "u", countedCash: -1, notes: "", expected, now })).toThrow(
      "El efectivo contado no puede ser negativo.",
    );
  });

  it("rejects closing an already closed session", () => {
    const { session } = closeSession(makeSession(), { actor: "u", countedCash: 0, notes: "", expected, now });
    expect(() => closeSession(session, { actor: "u", countedCash: 0, notes: "", expected, now })).toThrow(
      "La caja ya está cerrada.",
    );
  });
});

describe("closed sessions are immutable", () => {
  const expected = { cash: 0, transfer: 0, card: 0, mercado_pago: 0, other: 0 };
  const closed = () => closeSession(makeSession(), { actor: "u", countedCash: 0, notes: "", expected, now }).session;

  it("cannot be closed again", () => {
    expect(() => closeSession(closed(), { actor: "u", countedCash: 0, notes: "", expected, now })).toThrow(
      "La caja ya está cerrada.",
    );
  });

  it("rejects manual movements (session must be open)", () => {
    expect(() => assertSessionOpen(closed())).toThrow("El movimiento debe registrarse en una caja abierta.");
  });

  it("rejects cash writes (sales, expenses) with a closed-session error", () => {
    expect(() => assertCashWritable(closed())).toThrow("La caja está cerrada: no se pueden registrar movimientos de efectivo.");
    expect(() => assertCashWritable(makeSession())).not.toThrow();
  });

  it("rejects voiding a ticket whose session is closed", () => {
    expect(() => assertVoidAllowed(closed())).toThrow(
      "No se puede anular: la caja de este ticket ya está cerrada. Registre un ajuste manual en la caja abierta.",
    );
    expect(() => assertVoidAllowed(makeSession())).not.toThrow();
  });

  it("exposes no way back to OPEN", () => {
    const exported = Object.keys(domain).filter((k) => new RegExp("re" + "open", "i").test(k));
    expect(exported).toEqual([]);
  });
});
