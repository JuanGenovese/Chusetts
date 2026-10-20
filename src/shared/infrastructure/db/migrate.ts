import { config } from "dotenv";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDbConnection, requireDatabaseUrl } from "./client";

config({ path: ".env.local" });
config({ path: ".env" });

// Migrations prefer the session-mode/direct connection; the app runtime uses DATABASE_URL.
async function main() {
  const { db, close } = createDbConnection(process.env.DIRECT_DATABASE_URL || requireDatabaseUrl(), { max: 1 });
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
