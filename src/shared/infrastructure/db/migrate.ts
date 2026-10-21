import { migrate } from "drizzle-orm/postgres-js/migrator";
import { assertMigrationTarget, isLocalUrl } from "../auth/local-guard";
import { loadEnv } from "../env/load-env";
import { createDbConnection, requireDatabaseUrl } from "./client";

loadEnv();

// Migrations prefer the session-mode/direct connection; the app runtime uses DATABASE_URL.
// Local by default: a remote database needs `pnpm db:migrate --remote`.
async function main() {
  const databaseUrl = process.env.DIRECT_DATABASE_URL || requireDatabaseUrl();
  assertMigrationTarget(databaseUrl, { allowRemote: process.argv.includes("--remote") });
  if (!isLocalUrl(databaseUrl)) console.log(`Migrating REMOTE database at ${new URL(databaseUrl).host}`);

  const { db, close } = createDbConnection(databaseUrl, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("Migrations applied.");
  } finally {
    await close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
