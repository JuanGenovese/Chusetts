import { describe, expect, it } from "vitest";
import { InventoryError } from "./errors";
import { compatibleUnits, convertQuantity, normalizeUnit } from "./units";

describe("normalizeUnit", () => {
  it("normalizes case, spaces and aliases", () => {
    expect(normalizeUnit(" ML ")).toBe("ml");
    expect(normalizeUnit("Litros")).toBe("l");
    expect(normalizeUnit("pinta")).toBe("unidad");
    expect(normalizeUnit("Botellas")).toBe("unidad");
    expect(normalizeUnit("kilogramo")).toBe("kg");
  });
  it("rejects unknown units with the legacy message (oz and gr are seeded but not convertible)", () => {
    for (const bad of ["", "oz", "gr", "parsec"]) {
      expect(() => normalizeUnit(bad)).toThrow(new InventoryError("Unidad no compatible. Usá unidad, ml, l, g o kg."));
    }
  });
});

describe("compatibleUnits", () => {
  it("lists the units of the same magnitude", () => {
    expect(compatibleUnits("ml")).toEqual(["ml", "l"]);
    expect(compatibleUnits("kg")).toEqual(["g", "kg"]);
    expect(compatibleUnits("botella")).toEqual(["unidad"]);
  });
});

describe("convertQuantity", () => {
  it("converts inside a magnitude", () => {
    expect(convertQuantity(1.5, "l", "ml")).toBe(1500);
    expect(convertQuantity(250, "g", "kg")).toBe(0.25);
  });
  it("rejects non positive quantities", () => {
    expect(() => convertQuantity(0, "ml", "ml")).toThrow("La cantidad debe ser mayor que cero.");
    expect(() => convertQuantity(-1, "ml", "ml")).toThrow("La cantidad debe ser mayor que cero.");
  });
  it("rejects different magnitudes", () => {
    expect(() => convertQuantity(1, "kg", "ml")).toThrow(
      "No se puede convertir kg a ml: pertenecen a magnitudes distintas.",
    );
  });
});
