import { describe, expect, it } from "vitest";
import { SESSION_TTL_HOURS, evaluateSessionActivity, needsActivityRenewal } from "./session-ttl";

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);

describe("evaluateSessionActivity (legacy: 12h sliding window, expires_at <= now is expired)", () => {
  it("uses 12 hours", () => {
    expect(SESSION_TTL_HOURS).toBe(12);
  });
  it("is missing without activity data", () => {
    expect(evaluateSessionActivity(null, NOW)).toBe("missing");
  });
  it("is valid inside the window", () => {
    expect(evaluateSessionActivity(NOW - 11 * HOUR, NOW)).toBe("valid");
    expect(evaluateSessionActivity(NOW, NOW)).toBe("valid");
  });
  it("expires exactly at 12h (legacy expires_at <= now)", () => {
    expect(evaluateSessionActivity(NOW - 12 * HOUR + 1, NOW)).toBe("valid");
    expect(evaluateSessionActivity(NOW - 12 * HOUR, NOW)).toBe("expired");
    expect(evaluateSessionActivity(NOW - 13 * HOUR, NOW)).toBe("expired");
  });
  it("treats timestamps far in the future as expired (tampering / broken clock)", () => {
    expect(evaluateSessionActivity(NOW + 60_000, NOW)).toBe("valid");
    expect(evaluateSessionActivity(NOW + 10 * 60_000, NOW)).toBe("expired");
  });
});

describe("needsActivityRenewal", () => {
  it("renews only after 5 minutes to avoid rewriting the cookie on every request", () => {
    expect(needsActivityRenewal(NOW - 60_000, NOW)).toBe(false);
    expect(needsActivityRenewal(NOW - 5 * 60_000, NOW)).toBe(true);
  });
});
