/**
 * Money representation: INTEGER CENTS (1 ARS = 100 cents) end to end.
 *
 * - Domain and application layers only ever see integer cents (`Cents`).
 * - The database stores them in `bigint` columns (mode "number"; safe up to 2^53).
 * - Conversion from/to pesos happens only at the edges (forms, display).
 *
 * Rationale: the legacy app used floating point REAL and rounded to 2 decimals
 * everywhere; integer cents removes rounding drift entirely.
 */
export type Cents = number;

export function isCents(value: unknown): value is Cents {
  return typeof value === "number" && Number.isSafeInteger(value);
}

/** Parses a user-typed amount ("1234", "1234.5", "1.234,50") into cents. Returns null if invalid. */
export function parsePesosToCents(input: string): Cents | null {
  const raw = input.trim().replace(/\s/g, "");
  if (raw === "") return null;
  let normalized = raw;
  if (raw.includes(",")) {
    // es-AR style: dots are thousands separators, comma is the decimal separator.
    normalized = raw.replace(/\./g, "").replace(",", ".");
  }
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

export function centsToPesos(cents: Cents): number {
  return cents / 100;
}

export function formatCents(cents: Cents): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(centsToPesos(cents));
}

function groupThousands(pesos: number): string {
  return Math.abs(pesos).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Legacy `money()`: "$ 1.234" (space, dot thousands, no decimals, negatives as "$ -200"). */
export function formatMoney(cents: Cents): string {
  const pesos = Math.round(centsToPesos(cents));
  return `$ ${pesos < 0 ? "-" : ""}${groupThousands(pesos)}`;
}

/** Legacy `money_compact()`: "$1.234". */
export function formatMoneyCompact(cents: Cents): string {
  const pesos = Math.round(centsToPesos(cents));
  return `$${pesos < 0 ? "-" : ""}${groupThousands(pesos)}`;
}

/** Value shown in numeric inputs (Spanish decimal comma, two decimals, no thousands): "5000,00". */
export function formatPesosInput(cents: Cents): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
