import { describe, expect, it } from "vitest";
import { formatBusinessDate, formatDecimalInput, formatPercent, formatQuantityLabel, parseDecimalInput } from "./format";

describe("formatPercent (legacy pct)", () => {
  it("prints one decimal with a dot", () => {
    expect(formatPercent(1)).toBe("100.0%");
    expect(formatPercent(-1.3116)).toBe("-131.2%");
    expect(formatPercent(0)).toBe("0.0%");
  });
  it("falls back for non finite values", () => {
    expect(formatPercent(Number.NaN)).toBe("0,0%");
  });
});

describe("formatQuantityLabel (legacy qty_label)", () => {
  it("drops decimals for integers and uses a comma otherwise", () => {
    expect(formatQuantityLabel(3)).toBe("3");
    expect(formatQuantityLabel(1.5)).toBe("1,5");
    expect(formatQuantityLabel(0.25)).toBe("0,25");
  });
});

describe("formatBusinessDate", () => {
  it("renders dd/mm/yyyy", () => {
    expect(formatBusinessDate("2026-10-19")).toBe("19/10/2026");
  });
});

describe("parseDecimalInput", () => {
  it("accepts comma and dot decimals", () => {
    expect(parseDecimalInput("1,5")).toBe(1.5);
    expect(parseDecimalInput("1.5")).toBe(1.5);
    expect(parseDecimalInput("1.234,5")).toBe(1234.5);
    expect(parseDecimalInput("3")).toBe(3);
  });
  it("rejects garbage and empty input", () => {
    expect(parseDecimalInput("")).toBeNull();
    expect(parseDecimalInput("abc")).toBeNull();
    expect(parseDecimalInput("1,2,3")).toBeNull();
  });
});

describe("formatDecimalInput", () => {
  it("uses two decimals and a comma", () => {
    expect(formatDecimalInput(1)).toBe("1,00");
    expect(formatDecimalInput(0)).toBe("0,00");
  });
});
