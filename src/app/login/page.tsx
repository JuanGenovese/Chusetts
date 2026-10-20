import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loginAction } from "@/server/actions/auth";
import { loadLoginState } from "@/server/queries/auth";
import { NO_USERS_MESSAGE } from "@/shared/domain/auth/username";
import { LoginScreen } from "@/shared/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Chusetts Gestión" };

export default async function LoginPage() {
  const { user, hasUsers } = await loadLoginState();
  if (user) redirect("/");
  return <LoginScreen hasUsers={hasUsers} noUsersMessage={NO_USERS_MESSAGE} action={loginAction} />;
}
