import type { AppRole } from "../../domain/auth/username";

/** A row of our `users` table: the source of truth for role / active flag / display name. */
export interface AppUserRecord {
  id: string;
  username: string;
  displayName: string;
  role: AppRole;
  isActive: boolean;
  /** Supabase Auth user id this row is linked to (null until provisioned). */
  authUserId: string | null;
}

export interface UserDirectory {
  findByUsername(username: string): Promise<AppUserRecord | null>;
  findByAuthUserId(authUserId: string): Promise<AppUserRecord | null>;
  countUsers(): Promise<number>;
}

/** Credential check against the identity provider (Supabase Auth). A successful `signIn` opens a provider session. */
export interface PasswordAuthenticator {
  signIn(email: string, password: string): Promise<{ authUserId: string } | null>;
  signOut(): Promise<void>;
}
