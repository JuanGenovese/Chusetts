import { and, eq, isNull } from "drizzle-orm";
import type { ProvisioningGateway } from "../../application/auth/provisioning";
import type { DbExecutor } from "../db/client";
import { users } from "../db/schema";
import type { SupabaseAdminClient } from "./supabase-admin";

/**
 * Real side effects of provisioning. The legacy bcrypt hash goes to GoTrue's admin createUser as `password_hash`
 * (@supabase/auth-js `AdminUserAttributes.password_hash`: "supports bcrypt, scrypt (firebase) and argon2"), with the e-mail
 * already confirmed so no confirmation mail is ever needed.
 */
export function createProvisioningGateway(admin: SupabaseAdminClient, db: DbExecutor): ProvisioningGateway {
  return {
    async createAuthUser(email, passwordHash) {
      const { data, error } = await admin.auth.admin.createUser({ email, password_hash: passwordHash, email_confirm: true });
      if (error || !data.user) throw new Error(`createUser failed: ${error?.message ?? "no user returned"}`);
      return data.user.id;
    },
    async linkAppUser(appUserId, authUserId) {
      const updated = await db
        .update(users)
        .set({ authUserId })
        .where(and(eq(users.id, appUserId), isNull(users.authUserId)))
        .returning({ id: users.id });
      if (updated.length === 0) throw new Error("users row not found or already linked");
    },
  };
}
