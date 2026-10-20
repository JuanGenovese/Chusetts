/**
 * Public API of the inventory module. Other modules and `src/server` import ONLY from here.
 *
 * - Stand-alone use cases: `inventoryUseCases(deps)` (each call = its own transaction).
 * - Transaction-scoped service for callers that own the unit of work (sales ledger, product creation, voiding):
 *   `createInventoryService(repos.inventory, { clock, ids })`.
 */
export * from "./domain";
export * from "./application";
export * from "./infrastructure";
