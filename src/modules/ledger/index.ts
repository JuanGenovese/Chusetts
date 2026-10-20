/**
 * Public API of the ledger module (the movements ledger: sale tickets, expenses, purchases, stock-adjustment rows,
 * voids). Other modules and `src/server` import ONLY from here.
 *
 * - Stand-alone use cases: `ledgerUseCases(deps)` (each call = its own transaction; with the application-wide unit of
 *   work that transaction spans ledger + inventory + cash).
 * - Transaction-scoped service for callers that own the unit of work: `createLedgerService(repos.ledger, { clock, ids })`.
 * - Reads for screens live in the `reporting` module (CQRS-lite).
 */
export * from "./domain";
export * from "./application";
export * from "./infrastructure";
export * from "./ui";
