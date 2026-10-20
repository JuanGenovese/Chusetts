import type { AppUserRecord } from "@/shared/application/auth/ports";
import type { AccountGateway } from "@/shared/application/auth/provisioning";
import type { Clock } from "@/shared/application/runtime";
import type { AppRole } from "@/shared/domain/auth/username";
import type { AdminUserRow, ExportRow, PasswordEventRow } from "../../domain";

export interface UserAdminStore {
  /** Every user, ordered by username. */
  listUsers(): Promise<AdminUserRow[]>;
  findByUsername(username: string): Promise<AppUserRecord | null>;
  insertUser(input: { username: string; displayName: string; role: AppRole; authUserId: string }): Promise<void>;
}

export interface PasswordEventLog {
  record(event: PasswordEventRow): Promise<void>;
  /** Newest first. */
  listRecent(limit: number): Promise<PasswordEventRow[]>;
}

/** Every application table of the `public` schema, as plain rows (secrets are stripped by the domain, not here). */
export interface DataExportReader {
  readAllTables(): Promise<{ schemaVersion: string; tables: Record<string, ExportRow[]> }>;
}

export interface AdministrationDeps {
  users: UserAdminStore;
  events: PasswordEventLog;
  accounts: AccountGateway;
  exports: DataExportReader;
  clock: Clock;
}
