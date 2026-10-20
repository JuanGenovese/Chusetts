import { asc, desc, eq, getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import journal from "../../../../drizzle/meta/_journal.json";
import { DomainError } from "@/shared/domain/errors";
import type { Database, DbExecutor } from "@/shared/infrastructure/db/client";
import { PG_UNIQUE_VIOLATION, pgErrorInfo } from "@/shared/infrastructure/db/errors";
import * as schema from "@/shared/infrastructure/db/schema";
import { passwordEvents, users } from "@/shared/infrastructure/db/schema";
import type { DataExportReader, PasswordEventLog, UserAdminStore } from "../application/ports";

export function createUserAdminStore(db: DbExecutor): UserAdminStore {
  return {
    async listUsers() {
      const rows = await db
        .select({ id: users.id, username: users.username, displayName: users.displayName, role: users.role, isActive: users.isActive, createdAt: users.createdAt })
        .from(users)
        .orderBy(asc(users.username));
      return rows;
    },
    async findByUsername(username) {
      const [row] = await db.select().from(users).where(eq(users.username, username)).limit(1);
      return row
        ? { id: row.id, username: row.username, displayName: row.displayName, role: row.role, isActive: row.isActive, authUserId: row.authUserId }
        : null;
    },
    async insertUser(input) {
      try {
        await db.insert(users).values({ username: input.username, displayName: input.displayName, role: input.role, authUserId: input.authUserId });
      } catch (error) {
        // The unique constraint is the source of truth when two admins create the same username at once.
        const { code, constraint } = pgErrorInfo(error);
        if (code === PG_UNIQUE_VIOLATION && constraint === "users_username_unique") {
          throw new DomainError("USERNAME_TAKEN", "Ese nombre de usuario ya existe.");
        }
        throw error;
      }
    },
  };
}

export function createPasswordEventLog(db: DbExecutor): PasswordEventLog {
  return {
    async record(event) {
      await db.insert(passwordEvents).values({ username: event.username, type: event.type, performedBy: event.performedBy, occurredAt: event.occurredAt });
    },
    async listRecent(limit) {
      return db
        .select({ username: passwordEvents.username, type: passwordEvents.type, performedBy: passwordEvents.performedBy, occurredAt: passwordEvents.occurredAt })
        .from(passwordEvents)
        .orderBy(desc(passwordEvents.id))
        .limit(limit);
    },
  };
}

/** Tag of the latest migration shipped with the code (e.g. "0005_password_events"). */
export const latestMigrationTag = (): string => journal.entries[journal.entries.length - 1]?.tag ?? "unknown";

/**
 * Reads EVERY table declared in the Drizzle schema (all live in `public`), so a new table is exported without touching
 * this adapter. Rows are keyed by the database column names. Secrets are stripped later, in the domain.
 * All tables are read in ONE read-only REPEATABLE READ transaction, so a sale landing mid-export cannot leave a ticket
 * without its stock movements.
 */
export function createDataExportReader(db: Database): DataExportReader {
  return {
    async readAllTables() {
      const declared = (Object.values(schema) as unknown[]).filter((value): value is PgTable => is(value, PgTable));
      const tables = await db.transaction(
        async (tx) => {
          const snapshot: Record<string, Record<string, unknown>[]> = {};
          for (const table of declared) {
            const properties = Object.entries(getTableColumns(table));
            const rows: Record<string, unknown>[] = await tx.select().from(table);
            snapshot[getTableName(table)] = rows.map((row) => Object.fromEntries(properties.map(([property, column]) => [column.name, row[property]])));
          }
          return snapshot;
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
      return { schemaVersion: latestMigrationTag(), tables };
    },
  };
}
