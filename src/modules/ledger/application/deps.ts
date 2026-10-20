import type { Clock, IdGenerator } from "@/shared/application/runtime";
import type { LedgerUnitOfWork } from "./ports/repositories";

/** Dependencies of the stand-alone (own transaction) ledger use cases. */
export interface LedgerDeps {
  uow: LedgerUnitOfWork;
  clock: Clock;
  ids: IdGenerator;
}

/** What the tx-scoped service needs besides repositories. */
export type LedgerRuntime = Pick<LedgerDeps, "clock" | "ids">;
