/**
 * Runs `work` atomically: every repository obtained from `repos` shares one DB transaction.
 * Commits if `work` resolves, rolls back if it throws.
 */
export interface UnitOfWork<TRepositories> {
  run<T>(work: (repos: TRepositories) => Promise<T>): Promise<T>;
}

/**
 * Narrows a wide unit of work (e.g. the application-wide one that carries the repositories of EVERY module)
 * to the repositories a single module needs. All narrowed views of the same wide unit share its transaction
 * model: one `run` = one DB transaction, no matter how many modules take part in it.
 */
export function narrowUnitOfWork<TAll, TNarrow>(
  uow: UnitOfWork<TAll>,
  select: (repos: TAll) => TNarrow,
): UnitOfWork<TNarrow> {
  return { run: (work) => uow.run((repos) => work(select(repos))) };
}
