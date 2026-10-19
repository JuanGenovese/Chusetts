import type { CashUnitOfWork } from "./ports/repositories";
import type { Clock, IdGenerator } from "./ports/runtime";

/** Dependencies every cash use case receives (wired in src/server/composition). */
export interface CashDeps {
  uow: CashUnitOfWork;
  clock: Clock;
  ids: IdGenerator;
}
