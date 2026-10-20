import { describe, expect, it } from "vitest";
import { resolveDateParam, resolveMovementFilters } from "./movement-filters";

describe("resolveMovementFilters", () => {
  const today = "2026-08-30";

  it("defaults to the last 7 days, voided excluded (legacy: today - 7 days .. today)", () => {
    expect(resolveMovementFilters({}, today)).toEqual({ from: "2026-08-23", to: today, includeVoided: false });
  });

  it("crosses month and year boundaries when going back 7 days", () => {
    expect(resolveMovementFilters({}, "2026-01-03").from).toBe("2025-12-27");
  });

  it("takes valid dates and the voided flag from the query string", () => {
    expect(resolveMovementFilters({ desde: "2026-08-01", hasta: "2026-08-10", anulados: "1" }, today)).toEqual({
      from: "2026-08-01",
      to: "2026-08-10",
      includeVoided: true,
    });
  });

  it("falls back to the defaults on malformed or impossible dates and unknown flags", () => {
    expect(resolveMovementFilters({ desde: "ayer", hasta: "2026-02-31", anulados: "yes" }, today)).toEqual({
      from: "2026-08-23",
      to: today,
      includeVoided: false,
    });
  });

  it("uses the first value when a parameter is repeated", () => {
    expect(resolveMovementFilters({ desde: ["2026-08-02", "2026-08-03"] }, today).from).toBe("2026-08-02");
  });
});

describe("resolveDateParam", () => {
  it("takes a valid ISO date and falls back to the default otherwise", () => {
    expect(resolveDateParam("2026-08-01", "2026-08-30")).toBe("2026-08-01");
    expect(resolveDateParam(["2026-08-02", "2026-08-03"], "2026-08-30")).toBe("2026-08-02");
    expect(resolveDateParam("2026-13-01", "2026-08-30")).toBe("2026-08-30");
    expect(resolveDateParam(undefined, "2026-08-30")).toBe("2026-08-30");
  });
});
