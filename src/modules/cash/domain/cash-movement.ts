import { isCents, type Cents } from "@/shared/domain/money";
import { CashSessionError } from "./errors";
import type { CashMovement, CashMovementType, MovementSign } from "./types";

/** Manual movement types an admin may record, with their cash direction. */
export const MANUAL_MOVEMENT_SIGNS = {
  MANUAL_INCOME: 1,
  WITHDRAWAL: -1,
  CASH_EXPENSE: -1,
  POSITIVE_ADJUSTMENT: 1,
  NEGATIVE_ADJUSTMENT: -1,
} as const satisfies Partial<Record<CashMovementType, MovementSign>>;

export type ManualMovementType = keyof typeof MANUAL_MOVEMENT_SIGNS;

export const MANUAL_MOVEMENT_LABELS: Record<ManualMovementType, string> = {
  MANUAL_INCOME: "Ingreso manual",
  WITHDRAWAL: "Retiro",
  CASH_EXPENSE: "Gasto en efectivo",
  POSITIVE_ADJUSTMENT: "Ajuste positivo",
  NEGATIVE_ADJUSTMENT: "Ajuste negativo",
};

export function isManualMovementType(value: string): value is ManualMovementType {
  return Object.hasOwn(MANUAL_MOVEMENT_SIGNS, value);
}

export interface BuildCashMovementInput {
  id: string;
  sessionId: string;
  actor: string;
  type: CashMovementType;
  amount: Cents;
  sign: MovementSign;
  description: string;
  reason: string;
  referenceType?: string | null;
  referenceId?: string | null;
  referenceKey?: string | null;
  previousBalance: Cents;
  now: Date;
}

/** Ports `_record_cash_movement` validations: sign, non-negative amount, no negative cash balance. */
export function buildCashMovement(input: BuildCashMovementInput): CashMovement {
  if (input.sign !== -1 && input.sign !== 0 && input.sign !== 1) {
    throw new CashSessionError("Signo de movimiento inválido.");
  }
  if (!isCents(input.amount)) {
    throw new CashSessionError("El monto es inválido.");
  }
  if (input.amount < 0) {
    throw new CashSessionError("El monto no puede ser negativo.");
  }
  const balanceAfter = input.previousBalance + input.sign * input.amount;
  if (balanceAfter < 0) {
    throw new CashSessionError("El movimiento dejaría la caja con efectivo negativo.");
  }
  return {
    id: input.id,
    sessionId: input.sessionId,
    occurredAt: input.now,
    actor: input.actor,
    type: input.type,
    amount: input.amount,
    sign: input.sign,
    description: input.description.trim(),
    reason: input.reason.trim(),
    referenceType: input.referenceType ?? null,
    referenceId: input.referenceId ?? null,
    referenceKey: input.referenceKey ?? null,
    balanceBefore: input.previousBalance,
    balanceAfter,
  };
}
