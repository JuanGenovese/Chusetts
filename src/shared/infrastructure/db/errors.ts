/** Extracts a Postgres error code / constraint name from postgres.js errors, including Drizzle-wrapped ones. */
export function pgErrorInfo(error: unknown): { code?: string; constraint?: string } {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const e = current as { code?: string; constraint_name?: string; cause?: unknown };
    if (typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) {
      return { code: e.code, constraint: e.constraint_name };
    }
    current = e.cause;
  }
  return {};
}

export const PG_UNIQUE_VIOLATION = "23505";
