import { normalizeUsername, usernameToAuthEmail } from "./username";

/** One row of the legacy `users` table, as the provisioning script reads it. */
export interface LegacyAuthUser {
  username: string;
  displayName: string;
  role: string;
  active: boolean;
  /** bcrypt hash. Never logged. */
  passwordHash: string;
}

export interface AppUserState {
  id: string;
  authUserId: string | null;
}

export interface ProvisioningContext {
  /** `users` rows of the target database by normalized username. */
  appUsers: ReadonlyMap<string, AppUserState>;
  /** Existing Supabase Auth users by e-mail (to recover from a crash between "create" and "link"). */
  authUserIdsByEmail: ReadonlyMap<string, string>;
}

export type ProvisioningAction =
  | "create-and-link"
  | "link-existing"
  | "skip-already-linked"
  | "skip-inactive"
  | "error-missing-app-user"
  | "error-invalid-hash";

export interface ProvisioningItem {
  username: string;
  email: string;
  action: ProvisioningAction;
  appUserId?: string;
  authUserId?: string;
}

/** `$2a$` / `$2b$` / `$2y$`, two-digit cost, 22-char salt + 31-char digest. */
const BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export function isBcryptHash(value: string): boolean {
  return BCRYPT.test(value);
}

/** The destructive switch of the script: `--target` must be the host (and port) of NEXT_PUBLIC_SUPABASE_URL. */
export function assertTargetMatchesUrl(target: string, supabaseUrl: string): void {
  if (!target) throw new Error("--target <supabase-host> is required.");
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
  let host: string;
  try {
    host = new URL(supabaseUrl).host;
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
  }
  if (target.trim().toLowerCase() !== host.toLowerCase()) {
    throw new Error(`--target "${target}" does not match the host of NEXT_PUBLIC_SUPABASE_URL ("${host}"). Aborting.`);
  }
}

/** Pure planning step: decides what to do per legacy user, without touching any system. */
export function planProvisioning(users: readonly LegacyAuthUser[], context: ProvisioningContext): ProvisioningItem[] {
  return users.map((legacy): ProvisioningItem => {
    const username = normalizeUsername(legacy.username);
    const email = usernameToAuthEmail(username);
    const appUser = context.appUsers.get(username);
    if (!appUser) return { username, email, action: "error-missing-app-user" };
    if (appUser.authUserId) return { username, email, action: "skip-already-linked", appUserId: appUser.id, authUserId: appUser.authUserId };
    if (!legacy.active) return { username, email, action: "skip-inactive", appUserId: appUser.id };
    const existing = context.authUserIdsByEmail.get(email);
    if (existing) return { username, email, action: "link-existing", appUserId: appUser.id, authUserId: existing };
    if (!isBcryptHash(legacy.passwordHash)) return { username, email, action: "error-invalid-hash", appUserId: appUser.id };
    return { username, email, action: "create-and-link", appUserId: appUser.id };
  });
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * The script writes to two systems (Supabase Auth over HTTP and Postgres). Both must be the same project, otherwise
 * auth users could be created in one project and linked in another. Credentials are never part of an error message.
 */
export function assertSameProject(databaseUrl: string, supabaseUrl: string): void {
  let db: URL;
  let api: URL;
  try {
    db = new URL(databaseUrl);
    api = new URL(supabaseUrl);
  } catch {
    throw new Error("DATABASE_URL / NEXT_PUBLIC_SUPABASE_URL are not valid URLs.");
  }
  const dbLocal = LOOPBACK.has(db.hostname);
  const apiLocal = LOOPBACK.has(api.hostname);
  if (dbLocal || apiLocal) {
    if (dbLocal && apiLocal) return;
    throw new Error("DATABASE_URL and NEXT_PUBLIC_SUPABASE_URL must both be local or both be remote. Aborting.");
  }
  const ref = api.hostname.match(/^([a-z0-9]+)\.supabase\.(?:co|in|net)$/i)?.[1];
  if (!ref) throw new Error("Cannot verify that DATABASE_URL belongs to the Supabase project of NEXT_PUBLIC_SUPABASE_URL. Aborting.");
  const belongs = db.hostname.toLowerCase().includes(`.${ref.toLowerCase()}.`) || decodeURIComponent(db.username).toLowerCase().endsWith(`.${ref.toLowerCase()}`);
  if (!belongs) throw new Error("DATABASE_URL does not belong to the Supabase project of NEXT_PUBLIC_SUPABASE_URL. Aborting.");
}
