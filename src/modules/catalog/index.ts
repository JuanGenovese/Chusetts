/**
 * Public API of the catalog module (products, categories, suppliers, units, payment methods, movement categories).
 * Other modules and `src/server` import ONLY from here.
 *
 * - Stand-alone use cases: `catalogUseCases(deps)` (each call = its own transaction).
 * - Transaction-scoped service for callers that own the unit of work: `createCatalogService(repos, { clock, ids })`.
 */
export * from "./domain";
export * from "./application";
export * from "./infrastructure";
export * from "./ui";
