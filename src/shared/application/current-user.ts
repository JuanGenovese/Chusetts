export type CurrentUserRole = "admin" | "cashier";

export interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  role: CurrentUserRole;
}

/** Port: who is performing the request. Phase 1 uses a dev adapter; Phase 2 reads the Supabase session. */
export interface CurrentUserProvider {
  getCurrentUser(): Promise<CurrentUser>;
}
