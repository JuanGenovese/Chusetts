import type { Cents } from "@/shared/domain/money";
import type { AmountsByMethod, CashEvent, CashMovement, CashSession, SalesSummary } from "../domain";
import type { CashDeps } from "./deps";
import { assertVoidAllowed } from "../domain";
import { expectedFor, requireSession } from "./internal";

export const getOpenCashSession = (deps: CashDeps) => (userId: string): Promise<CashSession | null> =>
  deps.uow.run((repos) => repos.sessions.findOpenByUser(userId));

export const getCashBalance = (deps: CashDeps) => (sessionId: string): Promise<Cents> =>
  deps.uow.run((repos) => repos.movements.balance(sessionId));

export const getSalesSummary = (deps: CashDeps) => (sessionId: string): Promise<SalesSummary> =>
  deps.uow.run((repos) => repos.ledger.salesSummary(sessionId));

export const calculateExpected = (deps: CashDeps) => (sessionId: string): Promise<AmountsByMethod> =>
  deps.uow.run(async (repos) => {
    await requireSession(repos, sessionId);
    return expectedFor(repos, sessionId);
  });

/** True when the session is closed: its movements and tickets must not be edited or voided. */
export const isCashSessionLocked = (deps: CashDeps) => (sessionId: string): Promise<boolean> =>
  deps.uow.run(async (repos) => (await repos.sessions.findById(sessionId))?.status === "CLOSED");

export interface CashSessionOverview {
  session: CashSession;
  balance: Cents;
  expected: AmountsByMethod;
  salesSummary: SalesSummary;
  movements: CashMovement[];
  events: CashEvent[];
}

/** Everything the /caja page needs for the user's open session; null when there is none. */
export const getCashSessionOverview = (deps: CashDeps) => (userId: string): Promise<CashSessionOverview | null> =>
  deps.uow.run(async (repos) => {
    const session = await repos.sessions.findOpenByUser(userId);
    if (!session) return null;
    const [balance, expected, salesSummary, movements, events] = await Promise.all([
      repos.movements.balance(session.id),
      expectedFor(repos, session.id),
      repos.ledger.salesSummary(session.id),
      repos.movements.listBySession(session.id),
      repos.events.listBySession(session.id),
    ]);
    return { session, balance, expected, salesSummary, movements, events };
  });

/**
 * Guard for the future sales module: call BEFORE voiding a ticket (and before any sales/stock write in the same
 * unit of work). Throws CashSessionError if the ticket's session is closed or missing.
 * TODO(phase-4): sales `voidTicket` must call this first.
 */
export const assertCashSessionAllowsVoid = (deps: CashDeps) => (sessionId: string): Promise<void> =>
  deps.uow.run(async (repos) => assertVoidAllowed(await requireSession(repos, sessionId)));
