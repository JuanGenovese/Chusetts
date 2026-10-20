import { describe, expect, it } from "vitest";
import { dayTickStep, formatAxisDay, formatSi, linearAxis, niceStep, pieSlices, slicePath } from "./chart-math";

describe("niceStep", () => {
  it("rounds up to 1-2-5 steps", () => {
    expect(niceStep(3720)).toBe(5000);
    expect(niceStep(1500)).toBe(2000);
    expect(niceStep(800)).toBe(1000);
    expect(niceStep(0)).toBe(1);
  });
});

describe("linearAxis", () => {
  it("reproduces the Plotly ticks of the reference (0, 5k, 10k, 15k for 18.6k)", () => {
    expect(linearAxis(18600).ticks).toEqual([0, 5000, 10000, 15000]);
  });
  it("has a unit axis when there is no data", () => {
    expect(linearAxis(0).ticks[0]).toBe(0);
  });
});

describe("formatSi", () => {
  it("prints SI suffixes like Plotly", () => {
    expect(formatSi(15000)).toBe("15k");
    expect(formatSi(2500)).toBe("2.5k");
    expect(formatSi(1_500_000)).toBe("1.5M");
    expect(formatSi(250)).toBe("250");
    expect(formatSi(0)).toBe("0");
  });
});

describe("pieSlices", () => {
  it("splits the circle proportionally, clockwise from the top", () => {
    const [a, b] = pieSlices([75, 25]);
    expect(a.start).toBe(0);
    expect(a.fraction).toBeCloseTo(0.75);
    expect(b.end).toBeCloseTo(Math.PI * 2);
  });
  it("returns nothing for a zero total", () => {
    expect(pieSlices([0, 0])).toEqual([]);
  });
  it("draws a full circle for a single slice", () => {
    const [only] = pieSlices([10]);
    expect(slicePath(0, 0, 10, only.start, only.end)).toContain("A 10 10 0 1 1");
  });
});

describe("date axis", () => {
  it("formats days and chooses a tick step", () => {
    expect(formatAxisDay("2026-10-05")).toBe("Oct 5");
    expect(dayTickStep(31, 8)).toBe(5);
    expect(dayTickStep(3, 8)).toBe(1);
  });
});
