import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { createDbConnection, requireDatabaseUrl } from "./client";
import { users } from "./schema";
import { DEV_USER_ID } from "../dev/dev-user";

config({ path: ".env.local" });
config({ path: ".env" });

/** Seeds the fixed development user used by the Phase 1 CurrentUser adapter. */
async function main() {
  const { db, close } = createDbConnection(requireDatabaseUrl(), { max: 1 });
  try {
    await db
      .insert(users)
      .values({ id: DEV_USER_ID, username: "admin", displayName: "Administrador (dev)", role: "admin" })
      .onConflictDoUpdate({ target: users.id, set: { displayName: sql`excluded.display_name` } });
    console.log("Dev user seeded.");
  } finally {
    await close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
