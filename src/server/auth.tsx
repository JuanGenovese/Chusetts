import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import type { CurrentUser } from "@/shared/application/current-user";
import { Alert } from "@/shared/ui";
import { currentUserProvider } from "./composition";
import { PERMISSION_DENIED_MESSAGE, hasPermission, type Permission } from "./permissions";

/**
 * The logged-in, active user or a redirect. A missing identity (expired / revoked session, inactive user) goes through
 * `/auth/clear`, which drops the leftover provider session before showing the login screen.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await currentUserProvider.getCurrentUser();
  if (!user) redirect("/auth/clear");
  return user;
}

/**
 * Legacy `ensure_permission(...)` for a page: renders the legacy error instead of the page when the role lacks the
 * permission. Enforced on the server, so hiding the nav entry is never the only protection.
 */
export async function guardedPage(permission: Permission, render: (user: CurrentUser) => ReactNode | Promise<ReactNode>): Promise<ReactNode> {
  const user = await requireUser();
  if (!hasPermission(user, permission)) return <Alert tone="error">{PERMISSION_DENIED_MESSAGE}</Alert>;
  return render(user);
}
