import type { AppUserRecord } from "@/shared/application/auth/ports";
import type { AccountGateway } from "@/shared/application/auth/provisioning";
import type { AdminUserRow, ExportRow, PasswordEventRow } from "../../domain";
import type { AdministrationDeps } from "../ports/repositories";

/** In-memory fakes of the administration ports, with a call log so tests can assert ordering and compensation. */
export class InMemoryAdministration {
  users: (AppUserRecord & { createdAt: Date })[] = [];
  events: PasswordEventRow[] = [];
  authAccounts = new Map<string, { email: string; password: string }>();
  tables: Record<string, ExportRow[]> = {};
  calls: string[] = [];
  failInsertWith: Error | null = null;
  failDeleteWith: Error | null = null;
  private nextAuthId = 1;

  addUser(user: Partial<AppUserRecord> & { username: string }): AppUserRecord & { createdAt: Date } {
    const record = {
      id: `u-${this.users.length + 1}`,
      displayName: user.username,
      role: "cashier" as const,
      isActive: true,
      authUserId: `a-existing-${this.users.length + 1}`,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      ...user,
    };
    this.users.push(record);
    if (record.authUserId) this.authAccounts.set(record.authUserId, { email: `${record.username}@users.chusetts.local`, password: "old-password" });
    return record;
  }

  deps(now = new Date("2026-10-20T15:00:00Z")): AdministrationDeps {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- fakes close over the store
    const s = this;
    const accounts: AccountGateway = {
      async createAuthUserWithPassword(email, password) {
        const id = `a-${s.nextAuthId++}`;
        s.authAccounts.set(id, { email, password });
        s.calls.push(`auth:create:${email}`);
        return id;
      },
      async deleteAuthUser(id) {
        s.calls.push(`auth:delete:${id}`);
        if (s.failDeleteWith) throw s.failDeleteWith;
        s.authAccounts.delete(id);
      },
      async setAuthUserPassword(id, password) {
        s.calls.push(`auth:set-password:${id}`);
        const account = s.authAccounts.get(id);
        if (!account) throw new Error("auth user not found");
        account.password = password;
      },
    };
    return {
      clock: { now: () => now, businessDate: () => "2026-10-20" },
      accounts,
      users: {
        async listUsers(): Promise<AdminUserRow[]> {
          return [...s.users]
            .sort((a, b) => (a.username < b.username ? -1 : a.username > b.username ? 1 : 0))
            .map((u) => ({ id: u.id, username: u.username, displayName: u.displayName, role: u.role, isActive: u.isActive, createdAt: u.createdAt }));
        },
        async findByUsername(username) {
          return s.users.find((u) => u.username === username) ?? null;
        },
        async insertUser(input) {
          s.calls.push(`db:insert:${input.username}`);
          if (s.failInsertWith) throw s.failInsertWith;
          s.addUser({ ...input });
        },
      },
      events: {
        async record(event) {
          s.calls.push(`event:${event.type}:${event.username}`);
          s.events.push(event);
        },
        async listRecent(limit) {
          return [...s.events].reverse().slice(0, limit);
        },
      },
      exports: {
        async readAllTables() {
          return { schemaVersion: "0005_password_events", tables: s.tables };
        },
      },
    };
  }
}
