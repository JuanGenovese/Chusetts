import type { Cents } from "@/shared/domain/money";
import {
  CashSessionError,
  buildCashMovement,
  calculateExpectedAmounts,
  type AmountsByMethod,
  type CashEventType,
  type CashMovementType,
  type CashSession,
  type MovementSign,
} from "../domain";
import type { CashDeps } from "./deps";
import type { CashRepositories } from "./ports/repositories";

/** Ports `_record_cash_movement`: idempotency check, balance snapshot, validation, insert. */
export async function recordMovement(
  repos: CashRepositories,
  deps: CashDeps,
  params: {
    sessionId: string;
    actor: string;
    type: CashMovementType;
    amount: Cents;
    sign: MovementSign;
    description: string;
    reason: string;
    referenceType?: string;
    referenceId?: string;
    referenceKey?: string;
  },
): Promise<string> {
  if (params.referenceKey && (await repos.movements.existsByReferenceKey(params.referenceKey))) {
    throw new CashSessionError("Este movimiento ya impactó la caja.");
  }
  const previousBalance = await repos.movements.balance(params.sessionId);
  const movement = buildCashMovement({
    ...params,
    id: deps.ids.next(),
    previousBalance,
    now: deps.clock.now(),
  });
  await repos.movements.insert(movement);
  return movement.id;
}

export async function addEvent(
  repos: CashRepositories,
  deps: CashDeps,
  sessionId: string,
  type: CashEventType,
  actor: string,
  detail: Record<string, unknown>,
): Promise<void> {
  await repos.events.insert({ id: deps.ids.next(), sessionId, type, actor, occurredAt: deps.clock.now(), detail });
}

export async function requireSession(repos: CashRepositories, sessionId: string, lock = false): Promise<CashSession> {
  const session = await repos.sessions.findById(sessionId, { lock });
  if (!session) throw new CashSessionError("La caja no existe.");
  return session;
}

export async function expectedFor(repos: CashRepositories, sessionId: string): Promise<AmountsByMethod> {
  const [balance, totals] = await Promise.all([repos.movements.balance(sessionId), repos.ledger.nonCashTotals(sessionId)]);
  return calculateExpectedAmounts(balance, totals);
}
