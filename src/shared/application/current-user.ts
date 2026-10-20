import type { AppRole } from "../domain/auth/username";

export type CurrentUserRole = AppRole;

export interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  role: CurrentUserRole;
}

/**
 * Port: who is performing the request. Returns `null` when nobody is logged in (no / expired / revoked session,
 * or an inactive user). The Supabase adapter lives in `shared/infrastructure/auth`.
 */
export interface CurrentUserProvider {
  getCurrentUser(): Promise<CurrentUser | null>;
}
