import { createHmac, timingSafeEqual } from "node:crypto";
import { evaluateSessionActivity, needsActivityRenewal, type SessionActivityState } from "../../domain/auth/session-ttl";
import { supabaseSecretKey } from "./env";

/**
 * Signed "last activity" cookie: enforces the legacy 12h sliding session regardless of the Supabase project's own
 * session settings (Supabase refresh tokens never expire on the free plan). Value: `<authUserId>.<lastMs>.<hmac>`.
 * It is httpOnly and HMAC-signed with the server-only secret, so the browser cannot extend its own session.
 */
export const SESSION_ACTIVITY_COOKIE = "chusetts_session";

/** The browser keeps the cookie for 30 days (as the legacy one); the signed timestamp is the authority. */
export const SESSION_ACTIVITY_COOKIE_MAX_AGE = 30 * 24 * 3600;

const sign = (payload: string): string => createHmac("sha256", supabaseSecretKey()).update(`chusetts-session:${payload}`).digest("base64url");

export function createSessionActivityValue(authUserId: string, nowMs: number): string {
  const payload = `${authUserId}.${nowMs}`;
  return `${payload}.${sign(payload)}`;
}

export interface SessionActivity {
  authUserId: string;
  lastActivityMs: number;
}

/** Returns null for a missing, malformed or forged value. */
export function parseSessionActivityValue(value: string | undefined | null): SessionActivity | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [authUserId, stamp, signature] = parts;
  const expected = Buffer.from(sign(`${authUserId}.${stamp}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const lastActivityMs = Number(stamp);
  return Number.isSafeInteger(lastActivityMs) ? { authUserId, lastActivityMs } : null;
}

export interface ActivityCheck {
  state: SessionActivityState;
  renew: boolean;
}

/** Applies the pure TTL rule to a cookie value for the given verified auth user. */
export function checkSessionActivity(value: string | undefined | null, authUserId: string, nowMs: number): ActivityCheck {
  const activity = parseSessionActivityValue(value);
  if (!activity || activity.authUserId !== authUserId) return { state: "missing", renew: false };
  const state = evaluateSessionActivity(activity.lastActivityMs, nowMs);
  return { state, renew: state === "valid" && needsActivityRenewal(activity.lastActivityMs, nowMs) };
}

export function sessionActivityCookieOptions(secure: boolean) {
  return { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: SESSION_ACTIVITY_COOKIE_MAX_AGE, secure };
}
