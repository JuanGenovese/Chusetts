import { describe, expect, it } from "vitest";
import { parsePesosToCents } from "./money";

describe("parsePesosToCents", () => {
  it.each([
    ["1234", 123_400],
    ["1234.5", 123_450],
    ["1.234,50", 123_450],
    ["0,05", 5],
    ["-10", -1_000],
  ])("parses %s", (input, expected) => {
    expect(parsePesosToCents(input)).toBe(expected);
  });

  it.each(["", "abc", "1.234.5678", "12,345"])("rejects %j", (input) => {
    expect(parsePesosToCents(input)).toBeNull();
  });
});
