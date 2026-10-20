const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function isLocalUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return LOCAL_HOSTS.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

/** Safety net of the local-only tools (dev seed): refuse to run unless BOTH the database and Supabase are loopback. */
export function assertLocalEnvironment(env: Readonly<Record<string, string | undefined>>): void {
  if (!isLocalUrl(env.DATABASE_URL)) throw new Error("Refusing to run: DATABASE_URL is not a local database (use .env.local).");
  if (!isLocalUrl(env.NEXT_PUBLIC_SUPABASE_URL)) throw new Error("Refusing to run: NEXT_PUBLIC_SUPABASE_URL is not the local Supabase stack (use .env.local).");
}
