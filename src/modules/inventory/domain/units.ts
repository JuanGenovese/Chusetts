import { round9 } from "@/shared/domain/quantity";
import { InventoryError } from "./errors";

export type UnitGroup = "unidad" | "volumen" | "peso";

/** Ports `UNIT_DEFINITIONS`: canonical codes with their magnitude and factor to the group's base unit. */
export const UNIT_DEFINITIONS = {
  unidad: { group: "unidad", factor: 1 },
  ml: { group: "volumen", factor: 1 },
  l: { group: "volumen", factor: 1000 },
  g: { group: "peso", factor: 1 },
  kg: { group: "peso", factor: 1000 },
} as const satisfies Record<string, { group: UnitGroup; factor: number }>;

export type CanonicalUnit = keyof typeof UNIT_DEFINITIONS;

const UNIT_ALIASES: Record<string, CanonicalUnit> = {
  un: "unidad",
  u: "unidad",
  unidades: "unidad",
  mililitro: "ml",
  mililitros: "ml",
  litro: "l",
  litros: "l",
  gramo: "g",
  gramos: "g",
  kilogramo: "kg",
  kilogramos: "kg",
  // Historical presentations that represent one indivisible unit.
  botella: "unidad",
  botellas: "unidad",
  pinta: "unidad",
  pintas: "unidad",
  vaso: "unidad",
  vasos: "unidad",
  lata: "unidad",
  latas: "unidad",
  paquete: "unidad",
  paquetes: "unidad",
};

export function normalizeUnit(unit: string | null | undefined): CanonicalUnit {
  const cleaned = (unit ?? "").trim().toLowerCase();
  const normalized = Object.hasOwn(UNIT_ALIASES, cleaned) ? UNIT_ALIASES[cleaned] : cleaned;
  if (!Object.hasOwn(UNIT_DEFINITIONS, normalized)) {
    throw new InventoryError("Unidad no compatible. Usá unidad, ml, l, g o kg.");
  }
  return normalized as CanonicalUnit;
}

export function compatibleUnits(stockUnit: string): CanonicalUnit[] {
  const group = UNIT_DEFINITIONS[normalizeUnit(stockUnit)].group;
  return (Object.keys(UNIT_DEFINITIONS) as CanonicalUnit[]).filter((unit) => UNIT_DEFINITIONS[unit].group === group);
}

export function convertQuantity(quantity: number, fromUnit: string, toUnit: string): number {
  const value = Number(quantity);
  if (!(value > 0)) throw new InventoryError("La cantidad debe ser mayor que cero.");
  const source = normalizeUnit(fromUnit);
  const target = normalizeUnit(toUnit);
  const from = UNIT_DEFINITIONS[source];
  const to = UNIT_DEFINITIONS[target];
  if (from.group !== to.group) {
    throw new InventoryError(`No se puede convertir ${source} a ${target}: pertenecen a magnitudes distintas.`);
  }
  return round9((value * from.factor) / to.factor);
}
