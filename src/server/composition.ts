/**
 * Composition root: the only place where adapters are wired into use cases (manual DI).
 * Server Actions and server-side queries live in `src/server/actions` and `src/server/queries`
 * (NOT inside modules), so module UI/application/domain never import Next.js server APIs.
 */
import type { CurrentUserProvider } from "@/shared/application/current-user";
import { getDb } from "@/shared/infrastructure/db/client";
import { drizzleUnitOfWork } from "@/shared/infrastructure/db/unit-of-work";
import { DevCurrentUserProvider } from "@/shared/infrastructure/dev/dev-current-user";
import {
  SystemClock,
  UuidGenerator,
  closeCashSession,
  createCashRepositories,
  getCashSessionOverview,
  getOpenCashSession,
  openCashSession,
  recordManualCashMovement,
  type CashDeps,
} from "@/modules/cash";

// TODO(phase-2): swap for the Supabase Auth adapter.
export const currentUserProvider: CurrentUserProvider = new DevCurrentUserProvider();

export function cashDeps(): CashDeps {
  return {
    uow: drizzleUnitOfWork(getDb(), createCashRepositories),
    clock: new SystemClock(),
    ids: new UuidGenerator(),
  };
}

export function cashUseCases() {
  const deps = cashDeps();
  return {
    openCashSession: openCashSession(deps),
    getOpenCashSession: getOpenCashSession(deps),
    getCashSessionOverview: getCashSessionOverview(deps),
    recordManualCashMovement: recordManualCashMovement(deps),
    closeCashSession: closeCashSession(deps),
  };
}
