import { cache } from "react";
import { cookies } from "next/headers";
import { resolveSessionUser } from "../../application/auth/login";
import type { CurrentUser, CurrentUserProvider } from "../../application/current-user";
import { getDb } from "../db/client";
import { DrizzleUserDirectory } from "./drizzle-user-directory";
import { SESSION_ACTIVITY_COOKIE, checkSessionActivity } from "./session-activity";
import { createSupabaseServerClient } from "./supabase-server";

/**
 * CurrentUser adapter. Identity comes from Supabase Auth (`getUser()` validates the session with the Auth server, so a
 * revoked session stops working immediately); the 12h sliding rule comes from the signed activity cookie; role, active
 * flag and display name always come from our `users` table. Anything missing -> null (= logged out).
 */
const resolveCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const cookieStore = await cookies();
  const activity = checkSessionActivity(cookieStore.get(SESSION_ACTIVITY_COOKIE)?.value, data.user.id, Date.now());
  if (activity.state !== "valid") return null;

  return resolveSessionUser(new DrizzleUserDirectory(getDb()))(data.user.id);
});

export class SupabaseCurrentUserProvider implements CurrentUserProvider {
  getCurrentUser(): Promise<CurrentUser | null> {
    return resolveCurrentUser();
  }
}
