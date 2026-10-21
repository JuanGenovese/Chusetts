import { join } from "node:path";
import { config } from "dotenv";

/**
 * The ONLY place that loads env files for scripts and tests running outside Next (migrations, seeds, integration tests).
 * Same precedence as Next: `.env.local` first, then `.env`. dotenv never overrides a variable that is already set, so the
 * shell wins over both files and `.env` only fills what `.env.local` leaves out.
 * Not `@next/env` on purpose: with NODE_ENV=test it skips `.env.local`, which would point the tests at `.env` (production).
 */
export function loadEnv(cwd: string = process.cwd()): void {
  config({ path: join(cwd, ".env.local"), quiet: true });
  config({ path: join(cwd, ".env"), quiet: true });
}
