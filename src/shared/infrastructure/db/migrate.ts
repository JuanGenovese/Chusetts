import { config } from "dotenv";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDbConnection, requireDatabaseUrl } from "./client";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const { db, close } = createDbConnection(requireDatabaseUrl(), { max: 1 });
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
