import type { UnitOfWork } from "@/shared/application/unit-of-work";
import type { Database, DbTransaction } from "./client";

/**
 * Generic Drizzle unit of work: opens ONE Postgres transaction per `run` and builds
 * the module's repositories bound to it. Throwing inside `work` rolls everything back.
 */
export function drizzleUnitOfWork<TRepositories>(
  db: Database,
  buildRepositories: (tx: DbTransaction) => TRepositories,
): UnitOfWork<TRepositories> {
  return {
    run: (work) => db.transaction((tx) => work(buildRepositories(tx))),
  };
}
