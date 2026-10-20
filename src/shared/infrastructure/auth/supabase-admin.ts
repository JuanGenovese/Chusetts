import { createClient } from "@supabase/supabase-js";
import { supabasePublicEnv, supabaseSecretKey } from "./env";

/**
 * Admin client (secret key): bypasses RLS and can manage auth users. Used by provisioning scripts, the local dev seed
 * and the admin-only account actions (create user / reset password), wired in `src/server/composition.ts`.
 */
export function createSupabaseAdminClient() {
  return createClient(supabasePublicEnv().url, supabaseSecretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

/** All Supabase Auth users as `email -> id` (paginated; the project has a handful of users). */
export async function listAuthUserIdsByEmail(admin: SupabaseAdminClient): Promise<Map<string, string>> {
  const byEmail = new Map<string, string>();
  const perPage = 200;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Could not list auth users: ${error.message}`);
    for (const user of data.users) if (user.email) byEmail.set(user.email.toLowerCase(), user.id);
    if (data.users.length < perPage) return byEmail;
  }
}
