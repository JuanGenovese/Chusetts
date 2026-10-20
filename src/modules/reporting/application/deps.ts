import type { Clock } from "@/shared/application/runtime";
import type { ReportingUnitOfWork } from "./ports/repositories";

export interface ReportingDeps {
  uow: ReportingUnitOfWork;
  clock: Clock;
}
