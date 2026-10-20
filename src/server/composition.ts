/**
 * Composition root: the only place where adapters are wired into use cases (manual DI).
 * Server Actions and server-side queries live in `src/server/actions` and `src/server/queries`
 * (NOT inside modules), so module UI/application/domain never import Next.js server APIs.
 */
import type { CurrentUserProvider } from "@/shared/application/current-user";
import { getDb } from "@/shared/infrastructure/db/client";
import { loginWithPassword } from "@/shared/application/auth/login";
import { DrizzleUserDirectory } from "@/shared/infrastructure/auth/drizzle-user-directory";
import { SupabasePasswordAuthenticator } from "@/shared/infrastructure/auth/supabase-password-authenticator";
import { createSupabaseServerClient } from "@/shared/infrastructure/auth/supabase-server";
import { narrowUnitOfWork } from "@/shared/application/unit-of-work";
import { drizzleUnitOfWork } from "@/shared/infrastructure/db/unit-of-work";
import { SupabaseCurrentUserProvider } from "@/shared/infrastructure/auth/supabase-current-user";
import {
  SystemClock,
  UuidGenerator,
  closeCashSession,
  getCashSessionOverview,
  getOpenCashSession,
  listRecentCashSessions,
  openCashSession,
  recordManualCashMovement,
  type CashDeps,
} from "@/modules/cash";
import { catalogUseCases as buildCatalogUseCases, type CatalogDeps } from "@/modules/catalog";
import { inventoryUseCases as buildInventoryUseCases, type InventoryDeps } from "@/modules/inventory";
import { ledgerUseCases as buildLedgerUseCases, type LedgerDeps } from "@/modules/ledger";
import { reportingUseCases as buildReportingUseCases, type ReportingDeps } from "@/modules/reporting";
import { buildAppRepositories, type AppRepositories } from "./app-repositories";

export const currentUserProvider: CurrentUserProvider = new SupabaseCurrentUserProvider();

/** Login use case bound to the current request's cookies (the Supabase client writes the session cookies). */
export async function loginUseCase() {
  return loginWithPassword({
    directory: new DrizzleUserDirectory(getDb()),
    authenticator: new SupabasePasswordAuthenticator(await createSupabaseServerClient()),
  });
}

const runtime = () => ({ clock: new SystemClock(), ids: new UuidGenerator() });

/**
 * The application-wide unit of work: one `run` = one Postgres transaction with the repositories of EVERY module.
 * Each module receives a narrowed view (`narrowUnitOfWork`). The ledger's narrowed view still carries stock / cash /
 * catalog collaborators bound to the SAME transaction (see `buildAppRepositories`), so every ledger use case
 * (sale ticket, void, expense, purchase, adjustment) is atomic across ledger + inventory + cash.
 */
export function appUnitOfWork() {
  const rt = runtime();
  return drizzleUnitOfWork<AppRepositories>(getDb(), (tx) => buildAppRepositories(tx, rt));
}

export function cashDeps(): CashDeps {
  return { uow: narrowUnitOfWork(appUnitOfWork(), (r) => r.cash), ...runtime() };
}

export function catalogDeps(): CatalogDeps {
  return { uow: narrowUnitOfWork(appUnitOfWork(), (r) => r.catalog), ...runtime() };
}

export function inventoryDeps(): InventoryDeps {
  return { uow: narrowUnitOfWork(appUnitOfWork(), (r) => r.inventory), ...runtime() };
}

export function ledgerDeps(): LedgerDeps {
  return { uow: narrowUnitOfWork(appUnitOfWork(), (r) => r.ledger), ...runtime() };
}

export function reportingDeps(): ReportingDeps {
  return { uow: narrowUnitOfWork(appUnitOfWork(), (r) => r.reporting), clock: runtime().clock };
}

/** Today's business date (America/Argentina/Buenos_Aires), for pages that default a filter to "today". */
export const todayBusinessDate = (): string => runtime().clock.businessDate();

export const catalogUseCases = () => buildCatalogUseCases(catalogDeps());
export const inventoryUseCases = () => buildInventoryUseCases(inventoryDeps());
export const ledgerUseCases = () => buildLedgerUseCases(ledgerDeps());
export const reportingUseCases = () => buildReportingUseCases(reportingDeps());

export function cashUseCases() {
  const deps = cashDeps();
  return {
    openCashSession: openCashSession(deps),
    getOpenCashSession: getOpenCashSession(deps),
    getCashSessionOverview: getCashSessionOverview(deps),
    listRecentCashSessions: listRecentCashSessions(deps),
    recordManualCashMovement: recordManualCashMovement(deps),
    closeCashSession: closeCashSession(deps),
  };
}
