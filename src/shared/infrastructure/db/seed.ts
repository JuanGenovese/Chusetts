import { config } from "dotenv";
import { createDbConnection, requireDatabaseUrl } from "./client";
import { seedReferenceData } from "./seed-reference";

config({ path: ".env.local" });
config({ path: ".env" });

/** `pnpm db:seed`: idempotent reference data (units, payment methods, movement categories, default product category). */
async function main() {
  const { db, close } = createDbConnection(requireDatabaseUrl(), { max: 1 });
  try {
    await seedReferenceData(db);
    console.log("Reference data seeded.");
  } finally {
    await close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
