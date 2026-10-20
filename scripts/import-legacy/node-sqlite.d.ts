// @types/node@20 predates `node:sqlite`; this is the minimal surface the importer uses (Node >= 22.5, stable in 26).
declare module "node:sqlite" {
  export class StatementSync {
    all(...params: unknown[]): Record<string, unknown>[];
    get(...params: unknown[]): Record<string, unknown> | undefined;
  }
  export class DatabaseSync {
    constructor(path: string, options?: { readOnly?: boolean });
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
