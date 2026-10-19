import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;
/** The transaction handle passed to `db.transaction` callbacks. */
export type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Repositories accept either, so the same adapter code runs inside or outside a transaction. */
export type DbExecutor = Database | DbTransaction;

export interface DbConnection {
  db: Database;
  close(): Promise<void>;
}

export function createDbConnection(url: string, options: { max?: number } = {}): DbConnection {
  const client = postgres(url, {
    max: options.max ?? 5,
    // Required for Supabase's transaction pooler (pgbouncer); harmless with a direct connection.
    prepare: false,
  });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
  return url;
}

const globalForDb = globalThis as unknown as { __chusettsDb?: DbConnection };

/** Process-wide lazy singleton (survives Next.js dev hot reloads). */
export function getDb(): Database {
  globalForDb.__chusettsDb ??= createDbConnection(requireDatabaseUrl());
  return globalForDb.__chusettsDb.db;
}
