import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loginWithPassword, resolveSessionUser } from "../../application/auth/login";
import { executeProvisioning } from "../../application/auth/provisioning";
import { planProvisioning } from "../../domain/auth/provisioning-plan";
import { usernameToAuthEmail } from "../../domain/auth/username";
import { createDbConnection, requireDatabaseUrl, type DbConnection } from "../db/client";
import { users } from "../db/schema";
import { eq, inArray } from "drizzle-orm";
import { assertLocalEnvironment } from "./local-guard";
import { DrizzleUserDirectory } from "./drizzle-user-directory";
import { createProvisioningGateway } from "./provisioning-gateway";
import { SupabasePasswordAuthenticator } from "./supabase-password-authenticator";
import { createSupabaseAdminClient, listAuthUserIdsByEmail, type SupabaseAdminClient } from "./supabase-admin";
import { supabasePublicEnv } from "./env";

/** Runs against the LOCAL Supabase stack only (`supabase start`): real GoTrue + real Postgres. */
const tag = randomUUID().slice(0, 8);
const name = (base: string) => `it-${base}-${tag}`;
const PASSWORD = "Integration-pass-1";

let admin: SupabaseAdminClient;
let conn: DbConnection;
const createdAuthIds: string[] = [];
const createdUserIds: string[] = [];

/** A fresh, cookie-less client per sign-in: the same thing the SSR client does, minus the cookies. */
const anonClient = () => {
  const { url, publishableKey } = supabasePublicEnv();
  return createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
};

async function seedUser(base: string, over: { isActive?: boolean; link?: boolean; password?: string } = {}) {
  const username = name(base);
  let authUserId: string | null = null;
  if (over.link !== false) {
    const { data, error } = await admin.auth.admin.createUser({ email: usernameToAuthEmail(username), password: over.password ?? PASSWORD, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("no user");
    authUserId = data.user.id;
    createdAuthIds.push(authUserId);
  }
  const [row] = await conn.db
    .insert(users)
    .values({ username, displayName: `Display ${base}`, role: base.startsWith("cash") ? "cashier" : "admin", isActive: over.isActive ?? true, authUserId })
    .returning();
  createdUserIds.push(row.id);
  return { username, row, authUserId };
}

beforeAll(() => {
  assertLocalEnvironment(process.env);
  admin = createSupabaseAdminClient();
  conn = createDbConnection(requireDatabaseUrl(), { max: 2 });
});

afterAll(async () => {
  if (createdUserIds.length) await conn.db.delete(users).where(inArray(users.id, createdUserIds));
  for (const id of createdAuthIds) await admin.auth.admin.deleteUser(id);
  await conn.close();
});

describe("login against the local Supabase stack", () => {
  it("signs in an active linked user with username + password and resolves the session user", async () => {
    const { username, row } = await seedUser("admin1");
    const directory = new DrizzleUserDirectory(conn.db);
    const login = loginWithPassword({ directory, authenticator: new SupabasePasswordAuthenticator(anonClient()) });

    const result = await login({ username: `  ${username.toUpperCase()} `, password: PASSWORD });
    expect(result).toMatchObject({ ok: true, user: { id: row.id, username, role: "admin" } });

    if (result.ok) expect(await resolveSessionUser(directory)(result.authUserId)).toMatchObject({ id: row.id });
  });

  it("gives the generic legacy error for a wrong password, an unknown user, an inactive user and an unlinked user", async () => {
    const inactive = await seedUser("cash-off", { isActive: false });
    const unlinked = await seedUser("cash-unlinked", { link: false });
    const active = await seedUser("admin2");
    const login = loginWithPassword({ directory: new DrizzleUserDirectory(conn.db), authenticator: new SupabasePasswordAuthenticator(anonClient()) });
    const failure = { ok: false, message: "Usuario o contraseña incorrectos." };

    expect(await login({ username: active.username, password: "wrong-password" })).toEqual(failure);
    expect(await login({ username: name("nobody"), password: PASSWORD })).toEqual(failure);
    expect(await login({ username: inactive.username, password: PASSWORD })).toEqual(failure);
    expect(await login({ username: unlinked.username, password: PASSWORD })).toEqual(failure);
    // an inactive identity is also "logged out" for an already open session
    expect(await resolveSessionUser(new DrizzleUserDirectory(conn.db))(inactive.authUserId!)).toBeNull();
  });

  it("logout (local scope) revokes the session server-side", async () => {
    const { username } = await seedUser("admin3");
    const client = anonClient();
    const { data } = await client.auth.signInWithPassword({ email: usernameToAuthEmail(username), password: PASSWORD });
    expect(data.session).not.toBeNull();
    const accessToken = data.session!.access_token;

    await new SupabasePasswordAuthenticator(client).signOut();

    // The access token no longer maps to a live session (what `getUser()` in the CurrentUser adapter checks).
    const check = await anonClient().auth.getUser(accessToken);
    expect(check.data.user).toBeNull();
  });

  it("enforces the unique link between an auth user and an app user", async () => {
    const a = await seedUser("admin4");
    await expect(conn.db.insert(users).values({ username: name("dup"), displayName: "dup", authUserId: a.authUserId })).rejects.toThrow();
  });
});

describe("provisioning with legacy bcrypt hashes (local stack)", () => {
  it("creates the auth user with the EXISTING bcrypt hash, links it, and is idempotent", async () => {
    const legacyPassword = "Legacy-pass-123";
    const hash = bcrypt.hashSync(legacyPassword, 12).replace(/^\$2a\$/, "$2b$"); // legacy hashes are $2b$ (python bcrypt)
    const username = name("cash-legacy");
    const [row] = await conn.db.insert(users).values({ username, displayName: "Legacy", role: "cashier" }).returning();
    createdUserIds.push(row.id);
    const legacy = [{ username, displayName: "Legacy", role: "cajero", active: true, passwordHash: hash }];
    const gateway = createProvisioningGateway(admin, conn.db);
    const run = async (commit: boolean) => {
      const appRows = await conn.db.select().from(users).where(eq(users.username, username));
      const plan = planProvisioning(legacy, {
        appUsers: new Map(appRows.map((r) => [r.username, { id: r.id, authUserId: r.authUserId }])),
        authUserIdsByEmail: await listAuthUserIdsByEmail(admin),
      });
      return executeProvisioning(plan, new Map([[username, hash]]), gateway, { commit });
    };

    expect((await run(false))[0].outcome).toBe("would-create-and-link");
    expect((await conn.db.select().from(users).where(eq(users.id, row.id)))[0].authUserId).toBeNull();

    expect((await run(true))[0].outcome).toBe("created-and-linked");
    const [linked] = await conn.db.select().from(users).where(eq(users.id, row.id));
    expect(linked.authUserId).toBeTruthy();
    createdAuthIds.push(linked.authUserId!);

    // The legacy password works through the real login flow.
    const login = loginWithPassword({ directory: new DrizzleUserDirectory(conn.db), authenticator: new SupabasePasswordAuthenticator(anonClient()) });
    expect(await login({ username, password: legacyPassword })).toMatchObject({ ok: true, user: { role: "cashier" } });
    expect((await login({ username, password: "Legacy-pass-124" })).ok).toBe(false);

    // Idempotent re-run.
    expect((await run(true))[0].outcome).toBe("skipped-already-linked");
  });

  it("recovers from a crash between creating the auth user and linking it", async () => {
    const hash = bcrypt.hashSync("Crash-pass-1234", 12).replace(/^\$2a\$/, "$2b$");
    const username = name("cash-crash");
    const [row] = await conn.db.insert(users).values({ username, displayName: "Crash", role: "cashier" }).returning();
    createdUserIds.push(row.id);
    const gateway = createProvisioningGateway(admin, conn.db);
    createdAuthIds.push(await gateway.createAuthUser(usernameToAuthEmail(username), hash)); // created, never linked

    const plan = planProvisioning([{ username, displayName: "Crash", role: "cajero", active: true, passwordHash: hash }], {
      appUsers: new Map([[username, { id: row.id, authUserId: null }]]),
      authUserIdsByEmail: await listAuthUserIdsByEmail(admin),
    });
    expect(plan[0].action).toBe("link-existing");
    expect((await executeProvisioning(plan, new Map(), gateway, { commit: true }))[0].outcome).toBe("linked-existing");
  });
});
