import type { Cents } from "@/shared/domain/money";
import {
  MANUAL_MOVEMENT_LABELS,
  MANUAL_MOVEMENT_SIGNS,
  CashSessionError,
  assertCanRecordManualMovement,
  assertSessionOpen,
  isManualMovementType,
} from "../domain";
import type { CashDeps } from "./deps";
import { recordMovement, requireSession } from "./internal";

export interface RecordManualCashMovementInput {
  sessionId: string;
  actor: string;
  actorRole: string;
  /** One of MANUAL_MOVEMENT_SIGNS keys; validated here because callers pass raw form data. */
  type: string;
  amount: Cents;
  reason: string;
}

/** Admin-only manual cash movement (income, withdrawal, expense in cash, adjustments). Returns the movement id. */
export const recordManualCashMovement = (deps: CashDeps) => (input: RecordManualCashMovementInput): Promise<string> =>
  deps.uow.run(async (repos) => {
    assertCanRecordManualMovement(input.actorRole);
    const type = input.type.trim().toUpperCase();
    if (!isManualMovementType(type)) throw new CashSessionError("Tipo de movimiento de caja inválido.");
    const reason = input.reason.trim();
    if (!reason) throw new CashSessionError("El motivo es obligatorio.");
    if (!(input.amount > 0)) throw new CashSessionError("El monto debe ser mayor que cero.");
    const session = await requireSession(repos, input.sessionId, true).catch(() => {
      throw new CashSessionError("El movimiento debe registrarse en una caja abierta.");
    });
    assertSessionOpen(session);
    return recordMovement(repos, deps, {
      sessionId: session.id,
      actor: input.actor,
      type,
      amount: input.amount,
      sign: MANUAL_MOVEMENT_SIGNS[type],
      description: MANUAL_MOVEMENT_LABELS[type],
      reason,
      referenceType: "MANUAL_MOVEMENT",
    });
  });
