import type { Clock, IdGenerator } from "@/shared/application/runtime";
import type { InventoryUnitOfWork } from "./ports/repositories";

/** Dependencies of the stand-alone (own transaction) inventory use cases. */
export interface InventoryDeps {
  uow: InventoryUnitOfWork;
  clock: Clock;
  ids: IdGenerator;
}

/** What the tx-scoped service needs besides repositories. */
export type InventoryRuntime = Pick<InventoryDeps, "clock" | "ids">;
