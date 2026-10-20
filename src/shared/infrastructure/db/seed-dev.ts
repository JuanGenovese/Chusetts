import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { assertLocalEnvironment } from "../auth/local-guard";
import { createSupabaseAdminClient, listAuthUserIdsByEmail } from "../auth/supabase-admin";
import { usernameToAuthEmail } from "../../domain/auth/username";
import { createDbConnection, requireDatabaseUrl } from "./client";
import { LOCAL_SEED_USERS } from "./local-seed-users";
import { seedReferenceData } from "./seed-reference";
import { users } from "./schema";

config({ path: ".env.local" });
config({ path: ".env" });

/**
 * Local development seed: reference data + the local admin / cajero accounts (app rows AND Supabase Auth users, created
 * through the LOCAL Auth admin API). Idempotent. Refuses to run unless both the database and Supabase are loopback.
 */
async function main() {
  assertLocalEnvironment(process.env);
  const admin = createSupabaseAdminClient();
  const authIds = await listAuthUserIdsByEmail(admin);
  const { db, close } = createDbConnection(requireDatabaseUrl(), { max: 1 });
  try {
    for (const seed of LOCAL_SEED_USERS) {
      const email = usernameToAuthEmail(seed.username);
      let authUserId = authIds.get(email);
      if (authUserId) {
        // Keeps the documented local password even if someone changed it.
        const { error } = await admin.auth.admin.updateUserById(authUserId, { password: seed.password, email_confirm: true });
        if (error) throw new Error(`Could not update auth user "${seed.username}": ${error.message}`);
      } else {
        const { data, error } = await admin.auth.admin.createUser({ email, password: seed.password, email_confirm: true });
        if (error || !data.user) throw new Error(`Could not create auth user "${seed.username}": ${error?.message}`);
        authUserId = data.user.id;
      }
      await db
        .insert(users)
        .values({ id: seed.id, username: seed.username, displayName: seed.displayName, role: seed.role, isActive: true, authUserId })
        .onConflictDoUpdate({
          target: users.username,
          set: { displayName: seed.displayName, role: seed.role, isActive: true, authUserId },
        });
      console.log(`Local user "${seed.username}" (${seed.role}) ready.`);
    }
    await seedReferenceData(db);
    console.log("Reference data seeded.");
    // Sanity check of the link.
    const linked = await db.select({ u: users.username }).from(users).where(eq(users.isActive, true));
    console.log(`Active users: ${linked.map((l) => l.u).join(", ")}`);
  } finally {
    await close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
