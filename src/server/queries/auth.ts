import { getDb } from "@/shared/infrastructure/db/client";
import { DrizzleUserDirectory } from "@/shared/infrastructure/auth/drizzle-user-directory";
import type { CurrentUser } from "@/shared/application/current-user";
import { currentUserProvider } from "../composition";

/** What the login screen needs: who is already logged in (if anyone) and whether any user exists at all. */
export async function loadLoginState(): Promise<{ user: CurrentUser | null; hasUsers: boolean }> {
  const user = await currentUserProvider.getCurrentUser();
  if (user) return { user, hasUsers: true };
  return { user: null, hasUsers: (await new DrizzleUserDirectory(getDb()).countUsers()) > 0 };
}
