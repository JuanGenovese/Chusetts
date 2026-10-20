export interface MovementFilters {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  includeVoided: boolean;
}

type Param = string | string[] | undefined;

const first = (value: Param): string | undefined => (Array.isArray(value) ? value[0] : value);

function isIsoDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function daysBefore(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/** A single `YYYY-MM-DD` URL parameter (the "Fecha" of Mis tickets); anything malformed falls back to `fallback`. */
export function resolveDateParam(param: Param, fallback: string): string {
  const value = first(param);
  return isIsoDate(value) ? value : fallback;
}

/**
 * Filters of the movements history from the URL (`desde`, `hasta`, `anulados=1`). Legacy defaults: the last 7 days
 * up to today, voided movements excluded. Anything malformed falls back to the default instead of failing the page.
 */
export function resolveMovementFilters(params: Record<string, Param>, today: string): MovementFilters {
  const from = first(params.desde);
  const to = first(params.hasta);
  return {
    from: resolveDateParam(from, daysBefore(today, 7)),
    to: resolveDateParam(to, today),
    includeVoided: first(params.anulados) === "1",
  };
}
