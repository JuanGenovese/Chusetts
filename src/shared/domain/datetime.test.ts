import { describe, expect, it } from "vitest";
import { formatTimestamp } from "./datetime";

describe("formatTimestamp", () => {
  it("formats in the business time zone (UTC-3) as YYYY-MM-DD HH:MM:SS", () => {
    expect(formatTimestamp(new Date("2026-10-19T21:33:12Z"))).toBe("2026-10-19 18:33:12");
  });
  it("rolls the date over at local midnight", () => {
    expect(formatTimestamp(new Date("2026-10-20T02:59:59Z"))).toBe("2026-10-19 23:59:59");
    expect(formatTimestamp(new Date("2026-10-20T03:00:00Z"))).toBe("2026-10-20 00:00:00");
  });
});
