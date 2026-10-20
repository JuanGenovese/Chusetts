/**
 * Public API of the reporting module: the READ side of the ledger (CQRS-lite). It may query across tables directly
 * and never writes. Other modules and `src/server` import ONLY from here.
 *
 * - `reportingUseCases(deps)`: period summary, admin dashboard (Hoy / Mes / Stock), cashier home, tickets, history.
 * - All amounts are integer cents; there are no DataFrames, only typed DTOs.
 */
export * from "./domain";
export * from "./application";
export * from "./infrastructure";
export * from "./ui";
