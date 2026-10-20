import { describe, expect, it } from "vitest";
import { formatMoney, formatMoneyCompact, formatPesosInput, parsePesosToCents } from "./money";

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

describe("legacy money formatting", () => {
  it.each([
    [500_000, "$ 5.000"],
    [1_860_000, "$ 18.600"],
    [0, "$ 0"],
    [-20_000, "$ -200"],
    [123_456_700, "$ 1.234.567"],
  ])("formatMoney(%i) = %s", (cents, expected) => {
    expect(formatMoney(cents)).toBe(expected);
  });

  it("formatMoneyCompact has no space after the symbol", () => {
    expect(formatMoneyCompact(500_000)).toBe("$5.000");
    expect(formatMoneyCompact(-20_000)).toBe("$-200");
  });

  it.each([
    [500_000, "5000,00"],
    [0, "0,00"],
    [123_456, "1234,56"],
  ])("formatPesosInput(%i) = %s", (cents, expected) => {
    expect(formatPesosInput(cents)).toBe(expected);
  });
});
