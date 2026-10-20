import { describe, expect, it } from "vitest";
import { formatG, round9 } from "./quantity";

describe("round9", () => {
  it("rounds to 9 decimals", () => {
    expect(round9(0.1 + 0.2)).toBe(0.3);
    expect(round9(1.7999000000000001)).toBe(1.7999);
    expect(round9(2 - 0.0667 * 3)).toBe(1.7999);
  });
});

describe("formatG (Python :g)", () => {
  it("trims trailing zeros and keeps 6 significant digits", () => {
    expect(formatG(750)).toBe("750");
    expect(formatG(1.5)).toBe("1.5");
    expect(formatG(1234.5678)).toBe("1234.57");
    expect(formatG(0.0667)).toBe("0.0667");
    expect(formatG(0)).toBe("0");
  });
  it("switches to exponent notation like Python", () => {
    expect(formatG(1234567)).toBe("1.23457e+06");
    expect(formatG(0.00001)).toBe("1e-05");
  });
});
