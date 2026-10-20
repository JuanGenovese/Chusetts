import type { LedgerDeps } from "./deps";
import { createLedgerService, type LedgerService } from "./ledger-service";

type AsyncMethods = {
  [K in keyof LedgerService]: LedgerService[K] extends (...args: never[]) => Promise<unknown> ? K : never;
}[keyof LedgerService];

/**
 * Stand-alone use cases: each call runs in ITS OWN unit of work (one DB transaction). With the application-wide unit
 * of work that transaction spans ledger + inventory + cash (+ catalog reads), so every operation is atomic.
 * Callers that already own a transaction use `createLedgerService(repos, runtime)` instead.
 */
export const ledgerUseCases = (deps: LedgerDeps) => {
  const pick =
    <K extends AsyncMethods>(key: K) =>
    (...args: Parameters<LedgerService[K]>): ReturnType<LedgerService[K]> =>
      deps.uow.run((repos) => {
        const method = createLedgerService(repos, deps)[key] as (...a: unknown[]) => Promise<unknown>;
        return method(...args);
      }) as ReturnType<LedgerService[K]>;

  return {
    registerSaleTicket: pick("registerSaleTicket"),
    createAdminMovement: pick("createAdminMovement"),
    registerExpense: pick("registerExpense"),
    registerPurchase: pick("registerPurchase"),
    registerAdminSale: pick("registerAdminSale"),
    recordStockAdjustment: pick("recordStockAdjustment"),
    adjustStock: pick("adjustStock"),
    voidTicket: pick("voidTicket"),
    voidMovement: pick("voidMovement"),
  };
};

export type LedgerUseCases = ReturnType<typeof ledgerUseCases>;
