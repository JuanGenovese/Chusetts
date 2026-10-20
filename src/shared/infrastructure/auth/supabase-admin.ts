import { createClient } from "@supabase/supabase-js";
import { supabasePublicEnv, supabaseSecretKey } from "./env";

/**
 * Admin client (secret key): bypasses RLS and can manage auth users. ONLY for provisioning scripts and the local
 * dev seed; never import it from request-handling code.
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
