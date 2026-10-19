import type { CurrentUser, CurrentUserProvider } from "@/shared/application/current-user";
import { DEV_USER_ID } from "./dev-user";

/**
 * TODO(phase-2): replace with a Supabase Auth adapter. This DEV-ONLY adapter always returns
 * the fixed seeded admin user (see `pnpm db:seed:dev`) and must never reach production.
 */
export class DevCurrentUserProvider implements CurrentUserProvider {
  async getCurrentUser(): Promise<CurrentUser> {
    return { id: DEV_USER_ID, username: "admin", displayName: "Administrador (dev)", role: "admin" };
  }
}
