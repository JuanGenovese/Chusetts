import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDbConnection, requireDatabaseUrl, type DbConnection } from "@/shared/infrastructure/db/client";
import { passwordEvents, users } from "@/shared/infrastructure/db/schema";
import { assertLocalEnvironment } from "@/shared/infrastructure/auth/local-guard";
import { supabasePublicEnv } from "@/shared/infrastructure/auth/env";
import { createAccountGateway } from "@/shared/infrastructure/auth/provisioning-gateway";
import { createSupabaseAdminClient, type SupabaseAdminClient } from "@/shared/infrastructure/auth/supabase-admin";
import { administrationUseCases } from "../application";
import type { AdministrationDeps } from "../application";
import { createDataExportReader, createPasswordEventLog, createUserAdminStore, latestMigrationTag } from "./drizzle-administration";

/** LOCAL stack only (`supabase start`): real Postgres + real GoTrue, like the auth integration tests. */
const tag = randomUUID().slice(0, 8);
const name = (base: string) => `it-${base}-${tag}`;
const INITIAL = "Initial-pass-1";
const TEMPORARY = "Temporary-pass-2";

let admin: SupabaseAdminClient;
let conn: DbConnection;
let deps: AdministrationDeps;
const authIds = new Set<string>();

const anonClient = () => {
  const { url, publishableKey } = supabasePublicEnv();
  return createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
};
const signIn = (username: string, password: string) => anonClient().auth.signInWithPassword({ email: `${username}@users.chusetts.local`, password });

beforeAll(async () => {
  assertLocalEnvironment(process.env);
  admin = createSupabaseAdminClient();
  conn = createDbConnection(requireDatabaseUrl(), { max: 2 });
  deps = {
    users: createUserAdminStore(conn.db),
    events: createPasswordEventLog(conn.db),
    exports: createDataExportReader(conn.db),
    accounts: createAccountGateway(admin),
    clock: { now: () => new Date(), businessDate: () => "2026-10-20" },
  };
  await conn.db.insert(users).values({ username: name("admin"), displayName: "IT Admin", role: "admin" });
});

afterAll(async () => {
  const rows = await conn.db.select().from(users);
  const mine = rows.filter((u) => u.username.endsWith(`-${tag}`));
  for (const u of mine) if (u.authUserId) authIds.add(u.authUserId);
  await conn.db.delete(passwordEvents).where(inArray(passwordEvents.username, mine.map((u) => u.username)));
  await conn.db.delete(users).where(inArray(users.id, mine.map((u) => u.id)));
  for (const id of authIds) await admin.auth.admin.deleteUser(id);
  await conn.close();
});

describe("create user against the local stack", () => {
  it("creates the auth account and the linked users row; the new user can sign in", async () => {
    const cases = administrationUseCases(deps);
    const username = name("cash");
    await cases.createUser({ username: ` ${username.toUpperCase()} `, displayName: "IT Cashier", role: "cajero", password: INITIAL, passwordRepeat: INITIAL });

    const [row] = await conn.db.select().from(users).where(eq(users.username, username));
    expect(row).toMatchObject({ displayName: "IT Cashier", role: "cashier", isActive: true });
    expect(row.authUserId).toBeTruthy();
    authIds.add(row.authUserId!);

    const { data, error } = await signIn(username, INITIAL);
    expect(error).toBeNull();
    expect(data.user?.id).toBe(row.authUserId);
    expect((await cases.listUsers()).map((u) => u.username)).toContain(username);
    expect(await conn.db.select().from(passwordEvents).where(eq(passwordEvents.username, username))).toEqual([]);
  });

  it("deletes the auth account when the users insert fails", async () => {
    const username = name("rollback");
    const cases = administrationUseCases({ ...deps, users: { ...deps.users, insertUser: async () => { throw new Error("insert failed"); } } });
    await expect(cases.createUser({ username, displayName: "", role: "cajero", password: INITIAL, passwordRepeat: INITIAL })).rejects.toThrow("insert failed");

    const { error } = await signIn(username, INITIAL);
    expect(error).not.toBeNull();
    expect(await deps.users.findByUsername(username)).toBeNull();
  });

  it("refuses a duplicate username", async () => {
    const cases = administrationUseCases(deps);
    await expect(
      cases.createUser({ username: name("admin"), displayName: "", role: "admin", password: INITIAL, passwordRepeat: INITIAL }),
    ).rejects.toThrow("Ese nombre de usuario ya existe.");
  });

  it("maps a duplicate that slips past the pre-check (concurrent create) to the same message and drops the auth account", async () => {
    const username = name("race");
    await conn.db.insert(users).values({ username, displayName: "IT Race", role: "cashier" });
    // Simulates the other admin's insert landing between our pre-check and our insert: the unique constraint decides.
    const cases = administrationUseCases({ ...deps, users: { ...deps.users, findByUsername: async () => null } });
    await expect(cases.createUser({ username, displayName: "", role: "cajero", password: INITIAL, passwordRepeat: INITIAL })).rejects.toThrow(
      "Ese nombre de usuario ya existe.",
    );
    expect((await signIn(username, INITIAL)).error).not.toBeNull();
  });
});

describe("reset password against the local stack", () => {
  it("changes the password, revokes the old sessions immediately and records the audit event", async () => {
    const cases = administrationUseCases(deps);
    const username = name("victim");
    await cases.createUser({ username, displayName: "IT Victim", role: "cajero", password: INITIAL, passwordRepeat: INITIAL });
    const [row] = await conn.db.select().from(users).where(eq(users.username, username));
    authIds.add(row.authUserId!);

    const session = anonClient();
    const first = await session.auth.signInWithPassword({ email: `${username}@users.chusetts.local`, password: INITIAL });
    expect(first.error).toBeNull();
    expect((await session.auth.getUser()).error).toBeNull();

    await cases.resetPassword({ targetUsername: username, newPassword: TEMPORARY, actorUsername: name("admin") });

    expect((await signIn(username, INITIAL)).error).not.toBeNull();
    expect((await signIn(username, TEMPORARY)).error).toBeNull();
    // The session opened before the reset no longer validates against GoTrue (the app resolves users with getUser()).
    expect((await session.auth.getUser()).error).not.toBeNull();

    const events = (await cases.listPasswordEvents()).filter((e) => e.username === username);
    expect(events).toEqual([{ username, type: "RESTABLECIMIENTO_ADMIN", performedBy: name("admin"), occurredAt: expect.any(Date) }]);
  });

  it("lists the newest events first", async () => {
    const log = createPasswordEventLog(conn.db);
    const username = name("order");
    for (const performedBy of ["first", "second"]) {
      await log.record({ username, type: "RESTABLECIMIENTO_ADMIN", performedBy, occurredAt: new Date() });
    }
    const recent = (await log.listRecent(100)).filter((e) => e.username === username);
    expect(recent.map((e) => e.performedBy)).toEqual(["second", "first"]);
  });

  it("refuses a non-admin actor without touching the password", async () => {
    const cases = administrationUseCases(deps);
    const cashier = name("cash");
    await expect(cases.resetPassword({ targetUsername: name("admin"), newPassword: TEMPORARY, actorUsername: cashier })).rejects.toThrow(
      "Solo un administrador activo puede restablecer contraseñas.",
    );
  });
});

describe("data export against the local stack", () => {
  it("exports every schema table, names the latest migration and carries no credentials", async () => {
    const cases = administrationUseCases(deps);
    const { data, fileName } = await cases.exportData();
    expect(fileName).toBe("chusetts-export-2026-10-20.json");
    expect(data.schemaVersion).toBe(latestMigrationTag());
    expect(data.schemaVersion).toMatch(/^\d{4}_/);
    expect(Object.keys(data.tables)).toEqual(expect.arrayContaining(["users", "products", "movements", "cash_sessions", "password_events", "stock_levels"]));
    expect(data.tables.users.some((u) => u.username === name("admin"))).toBe(true);
    expect(Object.keys(data.tables.users[0])).toEqual(expect.arrayContaining(["id", "username", "display_name", "auth_user_id"]));

    const json = JSON.stringify(data);
    expect(json).not.toMatch(/password_hash|encrypted_password|secret|token/i);
    expect(json).not.toContain(INITIAL);
    expect(json).not.toContain(TEMPORARY);
  });
});
