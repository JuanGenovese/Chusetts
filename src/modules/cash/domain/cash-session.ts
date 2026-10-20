import { isCents, type Cents } from "@/shared/domain/money";
import { CashSessionError } from "./errors";
import { sumElectronic } from "./expected-amounts";
import type { AmountsByMethod, CashSession } from "./types";

export interface OpenSessionParams {
  id: string;
  openedBy: string;
  openingCash: Cents;
  notes: string;
  businessDate: string;
  now: Date;
}

export function openSession(input: OpenSessionParams): CashSession {
  if (!input.openedBy.trim()) throw new CashSessionError("El usuario es obligatorio.");
  if (!isCents(input.openingCash)) throw new CashSessionError("El efectivo inicial es inválido.");
  if (input.openingCash < 0) throw new CashSessionError("El efectivo inicial no puede ser negativo.");
  return {
    id: input.id,
    number: 0,
    businessDate: input.businessDate,
    openedBy: input.openedBy,
    openedAt: input.now,
    openingCash: input.openingCash,
    status: "OPEN",
    closedBy: null,
    closedAt: null,
    expectedAmounts: null,
    countedAmounts: null,
    difference: null,
    openingNotes: input.notes.trim(),
    closingNotes: "",
    updatedAt: input.now,
  };
}

export function assertSessionOpen(session: CashSession): void {
  if (session.status !== "OPEN") {
    throw new CashSessionError("El movimiento debe registrarse en una caja abierta.");
  }
}

/** Closed sessions are immutable: no cash movement may be written into them. */
export function assertCashWritable(session: CashSession): void {
  if (session.status !== "OPEN") {
    throw new CashSessionError(
      "La caja está cerrada: no se pueden registrar movimientos de efectivo.",
      "CASH_SESSION_CLOSED",
    );
  }
}

/** Voiding a ticket sold in a closed session is rejected; corrections go through a manual adjustment. */
export function assertVoidAllowed(session: CashSession): void {
  if (session.status !== "OPEN") {
    throw new CashSessionError(
      "No se puede anular: la caja de este ticket ya está cerrada. Registre un ajuste manual en la caja abierta.",
      "CASH_SESSION_CLOSED",
    );
  }
}

export interface CloseSessionParams {
  actor: string;
  countedCash: Cents;
  notes: string;
  expected: AmountsByMethod;
  now: Date;
}

export interface CloseResult {
  expectedCash: Cents;
  countedCash: Cents;
  difference: Cents;
  electronicTotal: Cents;
}

export function closeSession(
  session: CashSession,
  input: CloseSessionParams,
): { session: CashSession; result: CloseResult } {
  if (session.status !== "OPEN") throw new CashSessionError("La caja ya está cerrada.");
  if (!isCents(input.countedCash)) throw new CashSessionError("El efectivo contado es inválido.");
  if (input.countedCash < 0) throw new CashSessionError("El efectivo contado no puede ser negativo.");

  const difference = input.countedCash - input.expected.cash;
  // Only cash is physically counted; electronic methods are reconciled to their expected values.
  const countedAmounts: AmountsByMethod = { ...input.expected, cash: input.countedCash };
  const closed: CashSession = {
    ...session,
    status: "CLOSED",
    closedBy: input.actor,
    closedAt: input.now,
    expectedAmounts: { ...input.expected },
    countedAmounts,
    difference,
    closingNotes: input.notes.trim(),
    updatedAt: input.now,
  };
  return {
    session: closed,
    result: {
      expectedCash: input.expected.cash,
      countedCash: input.countedCash,
      difference,
      electronicTotal: sumElectronic(input.expected),
    },
  };
}
