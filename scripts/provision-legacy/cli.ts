import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { parse } from "dotenv";
import { executeProvisioning } from "../../src/shared/application/auth/provisioning";
import { assertSameProject, assertTargetMatchesUrl, planProvisioning, type AppUserState } from "../../src/shared/domain/auth/provisioning-plan";
import { legacyRoleToRole } from "../../src/shared/domain/auth/username";
import { createProvisioningGateway } from "../../src/shared/infrastructure/auth/provisioning-gateway";
import { createSupabaseAdminClient, listAuthUserIdsByEmail } from "../../src/shared/infrastructure/auth/supabase-admin";
import { createDbConnection } from "../../src/shared/infrastructure/db/client";
import { users } from "../../src/shared/infrastructure/db/schema";
import { readLegacyAuthUsers } from "./legacy-users";

/**
 * Migrates the legacy credentials into Supabase Auth: for every legacy user an Auth user is created through the admin API
 * with the EXISTING bcrypt hash (`password_hash`, supported by GoTrue's admin createUser: bcrypt / argon2 / scrypt), already
 * confirmed, and `users.auth_user_id` is linked by username. Dry-run by default; idempotent; prints usernames only.
 * Like db:import-legacy it does NOT read .env files implicitly: pass --env-file or export the variables.
 */
const USAGE = `Usage: pnpm auth:provision-legacy --legacy-db <upgraded.sqlite> --target <supabase-host> [--env-file <path>] [--commit]

  --legacy-db   legacy SQLite (opened read-only). A positional argument is accepted too.
  --target      host (and port) of NEXT_PUBLIC_SUPABASE_URL, e.g. abcd.supabase.co or 127.0.0.1:54321. Must match.
  --env-file    file with DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY.
  --commit      actually write. Without it (or with --dry-run) nothing is created or linked.

Prerequisite: the users already exist in the "users" table (pnpm db:import-legacy) and migrations are applied.`;

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    options: {
      "legacy-db": { type: "string" },
      target: { type: "string" },
      "env-file": { type: "string" },
      commit: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  const legacyPath = values["legacy-db"] ?? positionals[0];
  if (!legacyPath || !values.target) {
    console.error(USAGE);
    return 2;
  }
  if (values.commit && values["dry-run"]) {
    console.error("--commit and --dry-run are mutually exclusive.");
    return 2;
  }
  if (values["env-file"]) Object.assign(process.env, parse(readFileSync(resolve(values["env-file"]))));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const databaseUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || "";
  try {
    assertTargetMatchesUrl(values.target, supabaseUrl);
    if (!databaseUrl) throw new Error("DATABASE_URL is not set.");
    assertSameProject(databaseUrl, supabaseUrl);
  } catch (error) {
    console.error(`REFUSING: ${(error as Error).message} Nothing was connected or written.`);
    return 2;
  }

  const commit = values.commit;
  console.log(`Target: ${new URL(supabaseUrl).host}\nMode:   ${commit ? "COMMIT (writes)" : "dry-run (no writes)"}\nLegacy: ${resolve(legacyPath)}`);

  const legacy = readLegacyAuthUsers(resolve(legacyPath));
  for (const user of legacy) legacyRoleToRole(user.role); // validates the legacy role set (admin / cajero)

  const admin = createSupabaseAdminClient();
  const { db, close } = createDbConnection(databaseUrl, { max: 1 });
  try {
    const appRows = await db.select({ id: users.id, username: users.username, authUserId: users.authUserId }).from(users);
    const appUsers = new Map<string, AppUserState>(appRows.map((r) => [r.username, { id: r.id, authUserId: r.authUserId }]));
    const authUserIdsByEmail = await listAuthUserIdsByEmail(admin);

    const plan = planProvisioning(legacy, { appUsers, authUserIdsByEmail });
    const gateway = createProvisioningGateway(admin, db);
    const hashes = new Map(legacy.map((u) => [u.username.trim().toLowerCase(), u.passwordHash]));
    const outcomes = await executeProvisioning(plan, hashes, gateway, { commit });

    console.log("");
    for (const o of outcomes) console.log(`  ${o.outcome.padEnd(24)} ${o.username}${o.detail ? `  (${o.detail})` : ""}`);
    const errors = outcomes.filter((o) => o.outcome === "error").length;
    console.log(`\n${commit ? "DONE" : "DRY RUN (nothing written, re-run with --commit)"}: ${outcomes.length} users, ${errors} errors.`);
    return errors > 0 ? 1 : 0;
  } finally {
    await close();
  }
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  },
);
