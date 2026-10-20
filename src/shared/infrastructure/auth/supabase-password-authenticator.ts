import type { SupabaseClient } from "@supabase/supabase-js";
import type { PasswordAuthenticator } from "../../application/auth/ports";

/** Password sign-in through Supabase Auth. The client is cookie-bound, so a successful sign-in sets the session cookies. */
export class SupabasePasswordAuthenticator implements PasswordAuthenticator {
  constructor(private readonly supabase: SupabaseClient) {}

  async signIn(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) return null;
    return { authUserId: data.user.id };
  }

  async signOut() {
    // "local": revokes only this device's session, like the legacy logout (other devices stay logged in).
    await this.supabase.auth.signOut({ scope: "local" });
  }
}
