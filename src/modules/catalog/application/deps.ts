import type { Clock, IdGenerator } from "@/shared/application/runtime";
import type { CatalogUnitOfWork } from "./ports/repositories";

export interface CatalogDeps {
  uow: CatalogUnitOfWork;
  clock: Clock;
  ids: IdGenerator;
}

export type CatalogRuntime = Pick<CatalogDeps, "clock" | "ids">;
