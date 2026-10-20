"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { LOGIN_ERROR_MESSAGE } from "@/shared/domain/auth/username";
import type { ActionState } from "@/shared/ui";
import { SESSION_ACTIVITY_COOKIE, createSessionActivityValue, sessionActivityCookieOptions } from "@/shared/infrastructure/auth/session-activity";
import { loginUseCase } from "../composition";
import { endCurrentSession } from "../session";

/** Legacy `login_screen` submit: on success the session cookies are set and the user lands on "/" of their role. */
export async function loginAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const username = formData.get("username");
  const password = formData.get("password");
  if (typeof username !== "string" || typeof password !== "string") return { ok: false, message: LOGIN_ERROR_MESSAGE };

  let authUserId: string;
  try {
    const result = await (await loginUseCase())({ username, password });
    if (!result.ok) return { ok: false, message: result.message };
    authUserId = result.authUserId;
  } catch (error) {
    console.error(error);
    return { ok: false, message: "Ocurrió un error inesperado. Intente nuevamente." };
  }

  const secure = (await headers()).get("x-forwarded-proto") === "https";
  (await cookies()).set(SESSION_ACTIVITY_COOKIE, createSessionActivityValue(authUserId, Date.now()), sessionActivityCookieOptions(secure));
  redirect("/");
}

/** Legacy "Cerrar sesión": revokes this device's session and goes back to the login screen. */
export async function logoutAction(): Promise<void> {
  await endCurrentSession();
  redirect("/login");
}
