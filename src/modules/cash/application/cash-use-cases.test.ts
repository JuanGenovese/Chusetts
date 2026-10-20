import { beforeEach, describe, expect, it } from "vitest";
import { CashSessionError, PermissionDeniedError } from "../domain";
import { makeTestDeps } from "./testing/in-memory";
import {
  calculateExpected,
  closeCashSession,
  getCashBalance,
  getCashSessionOverview,
  getOpenCashSession,
  getSalesSummary,
  isCashSessionLocked,
  listRecentCashSessions,
  openCashSession,
  assertCashSessionAllowsVoid,
  recordCashExpense,
  recordCashReversal,
  recordCashSale,
  recordManualCashMovement,
} from "./index";

const pesos = (n: number) => n * 100;

let t: ReturnType<typeof makeTestDeps>;
beforeEach(() => {
  t = makeTestDeps();
});

async function openFor(user = "cashier-1", cash = pesos(50_000)) {
  return openCashSession(t.deps)({ userId: user, openingCash: cash, notes: "" });
}

describe("openCashSession", () => {
  it("opens, writes the OPENING movement and event", async () => {
    const s = await openFor();
    expect(s.status).toBe("OPEN");
    expect(await getCashBalance(t.deps)(s.id)).toBe(pesos(50_000));
    const movements = t.store.movements;
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ type: "OPENING", sign: 1, referenceKey: `OPENING:${s.id}` });
    expect(t.store.events.map((e) => e.type)).toEqual(["OPENING"]);
  });

  it("allows only one open session per user", async () => {
    await openFor();
    await expect(openFor()).rejects.toThrow("El usuario ya tiene una caja abierta.");
    await expect(openFor("cashier-2")).resolves.toBeDefined();
  });

  it("rejects negative opening cash without writing anything", async () => {
    await expect(openFor("u", -1)).rejects.toThrow(CashSessionError);
    expect(t.store.sessions.size).toBe(0);
  });

  it("getOpenCashSession returns the user's open session", async () => {
    const s = await openFor();
    expect((await getOpenCashSession(t.deps)("cashier-1"))?.id).toBe(s.id);
    expect(await getOpenCashSession(t.deps)("nobody")).toBeNull();
  });
});

describe("cash and electronic reconciliation (legacy test)", () => {
  it("reconciles cash and non-cash sales and locks the session on close", async () => {
    const s = await openFor();
    await recordCashSale(t.deps)({
      sessionId: s.id, saleMovementId: "mov-1", actor: "cashier-1", amount: pesos(20_000), description: "T-1",
    });
    t.store.nonCashTotals.set(s.id, [{ paymentMethod: "mercado_pago", kind: "sale", total: pesos(30_000) }]);
    t.store.salesSummaries.set(s.id, { sales: pesos(50_000), cashSales: pesos(20_000), electronicSales: pesos(30_000), tickets: 2 });

    const expected = await calculateExpected(t.deps)(s.id);
    expect(expected.cash).toBe(pesos(70_000));
    expect(expected.mercado_pago).toBe(pesos(30_000));
    expect((await getSalesSummary(t.deps)(s.id)).sales).toBe(pesos(50_000));

    expect(await isCashSessionLocked(t.deps)(s.id)).toBe(false);
    const result = await closeCashSession(t.deps)({
      sessionId: s.id, actor: "cashier-1", countedCash: pesos(69_500), notes: "Faltan 500",
    });
    expect(result.difference).toBe(-pesos(500));
    expect(await isCashSessionLocked(t.deps)(s.id)).toBe(true);
  });
});

describe("recordManualCashMovement", () => {
  it("admin withdrawal changes cash but not sales", async () => {
    const s = await openFor();
    await recordCashSale(t.deps)({ sessionId: s.id, saleMovementId: "m1", actor: "c", amount: pesos(20_000), description: "T-1" });
    await recordManualCashMovement(t.deps)({
      sessionId: s.id, actor: "admin-1", actorRole: "admin", type: "WITHDRAWAL", amount: pesos(10_000), reason: "Retiro de seguridad",
    });
    expect((await calculateExpected(t.deps)(s.id)).cash).toBe(pesos(60_000));
    expect((await getSalesSummary(t.deps)(s.id)).sales).toBe(0);
  });

  it("only admins may record manual movements", async () => {
    const s = await openFor();
    await expect(
      recordManualCashMovement(t.deps)({ sessionId: s.id, actor: "c", actorRole: "cashier", type: "WITHDRAWAL", amount: 100, reason: "x" }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it.each([
    ["type", { type: "NOPE" }, "Tipo de movimiento de caja inválido."],
    ["reason", { reason: "  " }, "El motivo es obligatorio."],
    ["amount", { amount: 0 }, "El monto debe ser mayor que cero."],
  ])("validates %s", async (_n, patch, message) => {
    const s = await openFor();
    await expect(
      recordManualCashMovement(t.deps)({
        sessionId: s.id, actor: "a", actorRole: "admin", type: "WITHDRAWAL", amount: 100, reason: "x", ...patch,
      }),
    ).rejects.toThrow(message);
  });

  it("requires an open session", async () => {
    const s = await openFor();
    await closeCashSession(t.deps)({ sessionId: s.id, actor: "c", countedCash: pesos(50_000), notes: "" });
    await expect(
      recordManualCashMovement(t.deps)({ sessionId: s.id, actor: "a", actorRole: "admin", type: "MANUAL_INCOME", amount: 100, reason: "x" }),
    ).rejects.toThrow("El movimiento debe registrarse en una caja abierta.");
  });

  it("rejects a withdrawal larger than the cash balance", async () => {
    const s = await openFor("c", 1_000);
    await expect(
      recordManualCashMovement(t.deps)({ sessionId: s.id, actor: "a", actorRole: "admin", type: "WITHDRAWAL", amount: 1_001, reason: "x" }),
    ).rejects.toThrow("El movimiento dejaría la caja con efectivo negativo.");
  });
});

describe("cash hooks for the sales module", () => {
  it("the same sale cannot impact cash twice", async () => {
    const s = await openFor("c", 0);
    const input = { sessionId: s.id, saleMovementId: "m1", actor: "c", amount: 1_000, description: "T-1" };
    await recordCashSale(t.deps)(input);
    await expect(recordCashSale(t.deps)({ ...input, description: "Duplicado" })).rejects.toThrow(
      "Este movimiento ya impactó la caja.",
    );
    expect(await getCashBalance(t.deps)(s.id)).toBe(1_000);
  });

  it("records a cash expense as an outflow using the absolute amount", async () => {
    const s = await openFor("c", 5_000);
    await recordCashExpense(t.deps)({ sessionId: s.id, expenseMovementId: "e1", actor: "c", amount: -2_000, description: "Hielo" });
    expect(await getCashBalance(t.deps)(s.id)).toBe(3_000);
    expect(t.store.movements.at(-1)).toMatchObject({ type: "CASH_OUTFLOW", sign: -1, amount: 2_000 });
  });

  it("reverses a cash sale (refund) and a cash expense (reversal)", async () => {
    const s = await openFor("c", 10_000);
    await recordCashSale(t.deps)({ sessionId: s.id, saleMovementId: "m1", actor: "c", amount: 4_000, description: "T-1" });
    const refundId = await recordCashReversal(t.deps)({
      originalMovementId: "m1", sessionId: s.id, kind: "sale", paymentMethod: "cash", amount: 4_000, description: "T-1", actor: "a", reason: "Error",
    });
    expect(refundId).not.toBeNull();
    expect(t.store.movements.at(-1)).toMatchObject({ type: "SALE_REFUND", sign: -1, description: "Anulación: T-1", referenceKey: "REVERSAL:m1" });
    expect(await getCashBalance(t.deps)(s.id)).toBe(10_000);

    await recordCashExpense(t.deps)({ sessionId: s.id, expenseMovementId: "e1", actor: "c", amount: 1_000, description: "Hielo" });
    await recordCashReversal(t.deps)({
      originalMovementId: "e1", sessionId: s.id, kind: "expense", paymentMethod: "cash", amount: 1_000, description: "Hielo", actor: "a", reason: "Error",
    });
    expect(t.store.movements.at(-1)).toMatchObject({ type: "OUTFLOW_REVERSAL", sign: 1 });
    expect(await getCashBalance(t.deps)(s.id)).toBe(10_000);
  });

  it("ignores reversals of non-cash movements or movements without a session", async () => {
    const base = { originalMovementId: "x", kind: "sale" as const, amount: 100, description: "d", actor: "a", reason: "r" };
    expect(await recordCashReversal(t.deps)({ ...base, sessionId: "s", paymentMethod: "card" })).toBeNull();
    expect(await recordCashReversal(t.deps)({ ...base, sessionId: null, paymentMethod: "cash" })).toBeNull();
  });

  it("rejects hooks for a missing session", async () => {
    await expect(
      recordCashSale(t.deps)({ sessionId: "nope", saleMovementId: "m", actor: "c", amount: 1, description: "d" }),
    ).rejects.toThrow("La caja no existe.");
  });
});

describe("closeCashSession", () => {
  it("writes CLOSING movement (sign 0), event and persists the difference", async () => {
    const s = await openFor("c", pesos(100));
    const result = await closeCashSession(t.deps)({ sessionId: s.id, actor: "c", countedCash: pesos(120), notes: "" });
    expect(result.difference).toBe(pesos(20));
    expect(t.store.movements.at(-1)).toMatchObject({ type: "CLOSING", sign: 0, amount: pesos(120), reason: "Cierre operativo" });
    expect(t.store.sessions.get(s.id)).toMatchObject({ status: "CLOSED", difference: pesos(20) });
    expect(t.store.events.at(-1)?.type).toBe("CLOSING");
    expect(await getCashBalance(t.deps)(s.id)).toBe(pesos(100));
  });

  it("errors on missing or already closed sessions", async () => {
    await expect(closeCashSession(t.deps)({ sessionId: "nope", actor: "c", countedCash: 0, notes: "" })).rejects.toThrow("La caja no existe.");
    const s = await openFor();
    await closeCashSession(t.deps)({ sessionId: s.id, actor: "c", countedCash: 0, notes: "" });
    await expect(closeCashSession(t.deps)({ sessionId: s.id, actor: "c", countedCash: 0, notes: "" })).rejects.toThrow("La caja ya está cerrada.");
  });

  it("rolls everything back when counted cash is invalid", async () => {
    const s = await openFor();
    await expect(closeCashSession(t.deps)({ sessionId: s.id, actor: "c", countedCash: -5, notes: "" })).rejects.toThrow(
      "El efectivo contado no puede ser negativo.",
    );
    expect(t.store.sessions.get(s.id)?.status).toBe("OPEN");
  });
});

describe("closed sessions are immutable", () => {
  it("rejects manual movements and a second close, leaving the session untouched", async () => {
    const s = await openFor("c", 1_000);
    await closeCashSession(t.deps)({ sessionId: s.id, actor: "c", countedCash: 1_000, notes: "" });
    const movementsBefore = t.store.movements.length;

    await expect(
      recordManualCashMovement(t.deps)({ sessionId: s.id, actor: "a", actorRole: "admin", type: "MANUAL_INCOME", amount: 1, reason: "x" }),
    ).rejects.toThrow("El movimiento debe registrarse en una caja abierta.");
    await expect(closeCashSession(t.deps)({ sessionId: s.id, actor: "c", countedCash: 0, notes: "" })).rejects.toThrow(
      "La caja ya está cerrada.",
    );
    expect(t.store.movements).toHaveLength(movementsBefore);
    expect(t.store.sessions.get(s.id)?.status).toBe("CLOSED");
  });

  it("rejects cash sale, expense and reversal hooks against a closed session and writes nothing", async () => {
    const s = await openFor("c", 10_000);
    await recordCashSale(t.deps)({ sessionId: s.id, saleMovementId: "m1", actor: "c", amount: 1_000, description: "T-1" });
    await closeCashSession(t.deps)({ sessionId: s.id, actor: "c", countedCash: 11_000, notes: "" });
    const before = structuredClone({ m: t.store.movements, e: t.store.events });

    await expect(
      recordCashSale(t.deps)({ sessionId: s.id, saleMovementId: "m2", actor: "c", amount: 1, description: "x" }),
    ).rejects.toThrow("La caja está cerrada");
    await expect(
      recordCashExpense(t.deps)({ sessionId: s.id, expenseMovementId: "e2", actor: "c", amount: 1, description: "x" }),
    ).rejects.toThrow("La caja está cerrada");
    const voidMessage = "No se puede anular: la caja de este ticket ya está cerrada. Registre un ajuste manual en la caja abierta.";
    await expect(
      recordCashReversal(t.deps)({
        originalMovementId: "m1", sessionId: s.id, kind: "sale", paymentMethod: "cash", amount: 1_000, description: "T-1", actor: "a", reason: "Error",
      }),
    ).rejects.toThrow(voidMessage);
    await expect(assertCashSessionAllowsVoid(t.deps)(s.id)).rejects.toThrow(voidMessage);
    expect({ m: t.store.movements, e: t.store.events }).toEqual(before);
  });

  it("assertCashSessionAllowsVoid passes for open sessions and rejects missing ones", async () => {
    const s = await openFor("c", 0);
    await expect(assertCashSessionAllowsVoid(t.deps)(s.id)).resolves.toBeUndefined();
    await expect(assertCashSessionAllowsVoid(t.deps)("nope")).rejects.toThrow("La caja no existe.");
  });

  it("lets the same user open a new session after closing", async () => {
    const s = await openFor("c", 0);
    await closeCashSession(t.deps)({ sessionId: s.id, actor: "c", countedCash: 0, notes: "" });
    await expect(openFor("c", 0)).resolves.toMatchObject({ status: "OPEN" });
  });
});

describe("getCashSessionOverview", () => {
  it("returns null without an open session and a full overview with one", async () => {
    expect(await getCashSessionOverview(t.deps)("c")).toBeNull();
    const s = await openFor("c", 1_000);
    const overview = await getCashSessionOverview(t.deps)("c");
    expect(overview?.session.id).toBe(s.id);
    expect(overview?.balance).toBe(1_000);
    expect(overview?.expected.cash).toBe(1_000);
    expect(overview?.movements).toHaveLength(1);
  });
});

describe("listRecentCashSessions", () => {
  it("lists the user's sessions newest first with sequential numbers, ignoring other users", async () => {
    const first = await openFor("c", 1_000);
    await closeCashSession(t.deps)({ sessionId: first.id, actor: "c", countedCash: 1_000, notes: "" });
    await openFor("other", 5);
    const second = await openFor("c", 2_000);
    const list = await listRecentCashSessions(t.deps)("c", 20);
    expect(list.map((s) => s.id)).toEqual([second.id, first.id]);
    expect(list[0].number).toBeGreaterThan(list[1].number);
    expect(await listRecentCashSessions(t.deps)("c", 1)).toHaveLength(1);
  });
});
