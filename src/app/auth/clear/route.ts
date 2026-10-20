import { NextResponse } from "next/server";
import { endCurrentSession } from "@/server/session";

export const dynamic = "force-dynamic";

/**
 * Drops a leftover session (inactive user, expired window, revoked identity) and shows the login screen.
 * Same idea as the legacy `/auth/logout` companion route: clear the cookies, 303 to `/login`.
 */
export async function GET(request: Request) {
  await endCurrentSession();
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
