import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublicEnv } from "./env";
import {
  SESSION_ACTIVITY_COOKIE,
  checkSessionActivity,
  createSessionActivityValue,
  sessionActivityCookieOptions,
} from "./session-activity";

/** Routes reachable without a session. `/auth/*` are the sign-out helpers. */
export const isPublicPath = (pathname: string) => pathname === "/login" || pathname.startsWith("/auth/");

const isSecure = (request: NextRequest) => request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";

/**
 * Proxy step: refreshes the Supabase session cookies, enforces the 12h sliding window and sends anonymous visitors to
 * `/login`. It is an OPTIMISTIC gate (no database access): pages and actions re-check the user and the permissions.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const { url, publishableKey } = supabasePublicEnv();

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // Must run before any response is produced: it refreshes an expired access token and writes the new cookies.
  const { data } = await supabase.auth.getClaims();
  const authUserId = data?.claims?.sub ?? null;
  const now = Date.now();
  const activity = authUserId
    ? checkSessionActivity(request.cookies.get(SESSION_ACTIVITY_COOKIE)?.value, authUserId, now)
    : { state: "missing" as const, renew: false };

  if (authUserId && activity.state === "valid") {
    if (activity.renew) response.cookies.set(SESSION_ACTIVITY_COOKIE, createSessionActivityValue(authUserId, now), sessionActivityCookieOptions(isSecure(request)));
    return response;
  }

  // Anonymous, expired (12h without activity) or without activity stamp: drop whatever session is left.
  const hadSession = authUserId !== null || request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  if (hadSession) await supabase.auth.signOut({ scope: "local" });
  if (request.cookies.has(SESSION_ACTIVITY_COOKIE)) response.cookies.delete(SESSION_ACTIVITY_COOKIE);

  if (isPublicPath(request.nextUrl.pathname)) return response;

  const redirect = NextResponse.redirect(new URL("/login", request.url));
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  for (const [key, value] of response.headers) if (key.toLowerCase() === "cache-control" || key === "expires" || key === "pragma") redirect.headers.set(key, value);
  return redirect;
}
