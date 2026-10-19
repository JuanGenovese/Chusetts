import type { Cents } from "@/shared/domain/money";
import { assertCashWritable, assertVoidAllowed } from "../domain";
import type { CashDeps } from "./deps";
import { recordMovement, requireSession } from "./internal";

/**
 * Hooks called by the future sales/expenses modules INSIDE their own transaction
 * (they must share the unit of work once Phase 4 composes both modules).
 * Each is idempotent per original movement id via a reference key.
 */

export interface RecordCashSaleInput {
  sessionId: string;
  saleMovementId: string;
  actor: string;
  amount: Cents;
  description: string;
}

export const recordCashSale = (deps: CashDeps) => (input: RecordCashSaleInput): Promise<string> =>
  deps.uow.run(async (repos) => {
    assertCashWritable(await requireSession(repos, input.sessionId, true));
    return recordMovement(repos, deps, {
      sessionId: input.sessionId,
      actor: input.actor,
      type: "CASH_SALE",
      amount: input.amount,
      sign: 1,
      description: input.description,
      reason: "Cobro de venta en efectivo",
      referenceType: "SALE_MOVEMENT",
      referenceId: input.saleMovementId,
      referenceKey: `MOVEMENT:${input.saleMovementId}`,
    });
  });

export interface RecordCashExpenseInput {
  sessionId: string;
  expenseMovementId: string;
  actor: string;
  amount: Cents;
  description: string;
}

export const recordCashExpense = (deps: CashDeps) => (input: RecordCashExpenseInput): Promise<string> =>
  deps.uow.run(async (repos) => {
    assertCashWritable(await requireSession(repos, input.sessionId, true));
    return recordMovement(repos, deps, {
      sessionId: input.sessionId,
      actor: input.actor,
      type: "CASH_OUTFLOW",
      amount: Math.abs(input.amount),
      sign: -1,
      description: input.description,
      reason: "Pago de compra o gasto en efectivo",
      referenceType: "EXPENSE_MOVEMENT",
      referenceId: input.expenseMovementId,
      referenceKey: `MOVEMENT:${input.expenseMovementId}`,
    });
  });

export interface RecordCashReversalInput {
  /** Id of the voided sales-ledger movement. */
  originalMovementId: string;
  /** Session the original movement belongs to, if any. */
  sessionId: string | null;
  kind: "sale" | "expense" | "purchase" | string;
  paymentMethod: string | null;
  amount: Cents;
  description: string;
  actor: string;
  reason: string;
}

/** Rejects (CashSessionError) when the session is closed. Returns the new cash movement id, or null when the voided movement never touched cash. */
export const recordCashReversal = (deps: CashDeps) => (input: RecordCashReversalInput): Promise<string | null> =>
  deps.uow.run(async (repos) => {
    if (input.paymentMethod !== "cash" || !input.sessionId) return null;
    let sign: 1 | -1;
    let type: "SALE_REFUND" | "OUTFLOW_REVERSAL";
    if (input.kind === "sale") {
      sign = -1;
      type = "SALE_REFUND";
    } else if (input.kind === "expense" || input.kind === "purchase") {
      sign = 1;
      type = "OUTFLOW_REVERSAL";
    } else {
      return null;
    }
    assertVoidAllowed(await requireSession(repos, input.sessionId, true));
    return recordMovement(repos, deps, {
      sessionId: input.sessionId,
      actor: input.actor,
      type,
      amount: Math.abs(input.amount),
      sign,
      description: `Anulación: ${input.description}`,
      reason: input.reason,
      referenceType: "MOVEMENT_REVERSAL",
      referenceId: input.originalMovementId,
      referenceKey: `REVERSAL:${input.originalMovementId}`,
    });
  });
