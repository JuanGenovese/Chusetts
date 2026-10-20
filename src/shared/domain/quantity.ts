/**
 * Decimal quantities (stock, recipe amounts). Stored as numeric(18,9) in Postgres and handled as JS numbers
 * rounded to 9 decimals exactly like the legacy `round(x, 9)` calls. Money NEVER uses this: it is integer cents.
 */
export const QUANTITY_DECIMALS = 9;
/** Legacy tolerance used when comparing stock against requirements. */
export const STOCK_EPSILON = 1e-9;

export function round9(value: number): number {
  const factor = 10 ** QUANTITY_DECIMALS;
  return Math.round((value + Number.EPSILON * Math.sign(value)) * factor) / factor;
}

/** Python's `f"{value:g}"` (6 significant digits, trailing zeros trimmed) used in legacy user-facing messages. */
export function formatG(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return "0";
  const exponential = value.toExponential(5);
  const exponent = Number(exponential.split("e")[1]);
  if (exponent < -4 || exponent >= 6) {
    const [mantissa, exp] = exponential.split("e");
    const trimmed = mantissa.includes(".") ? mantissa.replace(/\.?0+$/, "") : mantissa;
    const sign = exp.startsWith("-") ? "-" : "+";
    return `${trimmed}e${sign}${exp.replace(/^[+-]/, "").padStart(2, "0")}`;
  }
  return String(Number(value.toPrecision(6)));
}
