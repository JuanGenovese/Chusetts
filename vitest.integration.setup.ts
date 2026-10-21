import { isLocalUrl } from "./src/shared/infrastructure/auth/local-guard";
import { loadEnv } from "./src/shared/infrastructure/env/load-env";

loadEnv();

// Integration tests insert, truncate and delete data: they may only ever run against the LOCAL stack (`supabase start`).
if (!isLocalUrl(process.env.DATABASE_URL)) {
  throw new Error("Refusing to run integration tests: DATABASE_URL is not a local database. Use .env.local (see .env.local.example).");
}
