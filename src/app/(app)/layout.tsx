import type { ReactNode } from "react";
import { navItemsFor } from "@/shared/navigation";
import { AppShell } from "@/shared/ui";
import { logoutAction } from "@/server/actions/auth";
import { requireUser } from "@/server/auth";

// Reads the current user (and the database in pages) on every request.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell user={{ displayName: user.displayName, role: user.role }} nav={navItemsFor(user.role)} logoutAction={logoutAction}>
      {children}
    </AppShell>
  );
}
