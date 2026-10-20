/**
 * Display and input helpers ported from the legacy `services/helpers.py` (`pct`, `qty_label`) plus the
 * es-AR decimal-comma conventions of the Streamlit number inputs.
 */

/** Legacy `pct()`: Python `f"{value:.1%}"` ("100.0%", "-131.2%"). Not-finite values use the legacy fallback. */
export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return "0,0%";
  return `${(ratio * 100).toFixed(1)}%`;
}

/** Legacy `qty_label()`: integers without decimals, otherwise decimal comma ("1,5"). */
export function formatQuantityLabel(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Number.isInteger(value)) return String(value);
  return String(value).replace(".", ",");
}

/** "2026-10-19" -> "19/10/2026" (legacy `strftime('%d/%m/%Y')`). Anything else is returned untouched. */
export function formatBusinessDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : isoDate;
}

/**
 * Parses a typed decimal quantity ("1,5", "1.5", "1.234,5") into a number. Returns null when invalid.
 * Same convention as `parsePesosToCents`: with a comma, dots are thousands separators.
 */
export function parseDecimalInput(input: string): number | null {
  const raw = input.trim().replace(/\s/g, "");
  if (raw === "") return null;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Value shown in a decimal input (comma, two decimals): 1 -> "1,00". */
export function formatDecimalInput(value: number): string {
  return value.toFixed(2).replace(".", ",");
}
