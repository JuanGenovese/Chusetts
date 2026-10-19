/**
 * Runs `work` atomically: every repository obtained from `repos` shares one DB transaction.
 * Commits if `work` resolves, rolls back if it throws.
 */
export interface UnitOfWork<TRepositories> {
  run<T>(work: (repos: TRepositories) => Promise<T>): Promise<T>;
}
