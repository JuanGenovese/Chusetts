/**
 * Legacy session_auth.py: SESSION_TTL_HOURS = 12 with a SLIDING window. Every restore (page load) renews the expiry;
 * a session whose `expires_at <= now` is dead. The new app keeps the same rule with a signed "last activity" cookie.
 */
export const SESSION_TTL_HOURS = 12;
export const SESSION_TTL_MS = SESSION_TTL_HOURS * 3_600_000;

/** Tolerated clock skew for a "last activity" stamp that lies in the future. */
const MAX_FUTURE_SKEW_MS = 5 * 60_000;
/** The cookie is re-stamped at most this often (the window is 12h, finer granularity is pointless). */
const RENEW_AFTER_MS = 5 * 60_000;

export type SessionActivityState = "valid" | "expired" | "missing";

export function evaluateSessionActivity(lastActivityMs: number | null, nowMs: number): SessionActivityState {
  if (lastActivityMs === null || !Number.isFinite(lastActivityMs)) return "missing";
  if (lastActivityMs > nowMs + MAX_FUTURE_SKEW_MS) return "expired";
  return nowMs >= lastActivityMs + SESSION_TTL_MS ? "expired" : "valid";
}

export function needsActivityRenewal(lastActivityMs: number, nowMs: number): boolean {
  return nowMs - lastActivityMs >= RENEW_AFTER_MS;
}
