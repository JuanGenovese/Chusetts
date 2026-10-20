import { cookies } from "next/headers";
import { SESSION_ACTIVITY_COOKIE } from "@/shared/infrastructure/auth/session-activity";
import { createSupabaseServerClient } from "@/shared/infrastructure/auth/supabase-server";

/**
 * Ends the current device's session: revokes it in Supabase Auth ("local" scope, like the legacy per-device revoke)
 * and drops the activity cookie. Not a Server Action: callers are the logout action and `/auth/clear`.
 */
export async function endCurrentSession(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
  (await cookies()).delete(SESSION_ACTIVITY_COOKIE);
}
