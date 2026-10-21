import { createHash } from "node:crypto";

/**
 * Pure mapping rules legacy (Streamlit/SQLite) -> chusetts-web (Postgres). No I/O here so every rule is unit tested.
 */

export class LegacyDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LegacyDataError";
  }
}

/** Legacy REAL pesos -> integer cents. Float noise is absorbed; a real fraction of a cent is an error (never silently rounded). */
export function pesosToCents(value: number | null | undefined, label: string): number {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    throw new LegacyDataError(`${label}: invalid amount ${String(value)}`);
  }
  if (value < 0) throw new LegacyDataError(`${label}: negative amount ${value}`);
  const scaled = value * 100;
  const cents = Math.round(scaled);
  if (Math.abs(scaled - cents) > 1e-6) throw new LegacyDataError(`${label}: ${value} is not an exact number of cents`);
  return cents;
}

/** Legacy REAL quantity -> numeric(18,9) value (the legacy itself used round(x, 9)). */
export function toDecimal(value: number | null | undefined, label: string): number {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    throw new LegacyDataError(`${label}: invalid quantity ${String(value)}`);
  }
  return Math.round(value * 1e9) / 1e9;
}

export type NewRole = "admin" | "cashier";

export function mapRole(legacyRole: string): NewRole {
  const role = legacyRole.trim().toLowerCase();
  if (role === "admin") return "admin";
  if (role === "cajero") return "cashier";
  throw new LegacyDataError(`Unknown legacy role "${legacyRole}"`);
}

export interface PaymentMethodRef {
  code: string;
  name: string;
}

const PAYMENT_METHODS: Record<string, PaymentMethodRef> = {
  efectivo: { code: "EFECTIVO", name: "Efectivo" },
  transferencia: { code: "TRANSFERENCIA", name: "Transferencia" },
  tarjeta: { code: "TARJETA", name: "Tarjeta" },
  "mercado pago": { code: "MERCADO_PAGO", name: "Mercado Pago" },
  // The legacy upgrade renamed "Mercado Pago" to "Nave"; both map to Mercado Pago.
  nave: { code: "MERCADO_PAGO", name: "Mercado Pago" },
  otro: { code: "OTRO", name: "Otro" },
};

export function mapPaymentMethod(name: string | null | undefined): PaymentMethodRef | null {
  const key = (name ?? "").trim().toLowerCase();
  if (key === "") return null;
  const found = PAYMENT_METHODS[key];
  if (!found) throw new LegacyDataError(`Unknown legacy payment method "${name}"`);
  return found;
}

/**
 * Legacy timestamps are naive local strings ("YYYY-MM-DD HH:MM:SS"). The recorded sale hours cluster between 19:00 and
 * 04:00, i.e. they were written in the bar's local time (Argentina, UTC-3, no DST), not in the host's UTC.
 */
export function legacyTimestampToIso(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(value.trim());
  if (!match) throw new LegacyDataError(`Invalid legacy timestamp "${value}"`);
  return `${match[1]}T${match[2]}-03:00`;
}

const NAMESPACE = "6f1d3c2e-8f1a-4c1b-9d6e-1c5a0b7d2e11";

/** Deterministic UUID v5 so every run (and a --replace re-run) assigns the same id to the same legacy row. */
export function legacyUuid(entity: string, key: string | number): string {
  const ns = Buffer.from(NAMESPACE.replace(/-/g, ""), "hex");
  const hash = createHash("sha1").update(ns).update(`${entity}:${key}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Same format as the legacy `printf('P-%04d', id)` / the catalog module's `defaultSku`. */
export function productSku(productNumber: number): string {
  return `P-${String(productNumber).padStart(4, "0")}`;
}

/** The new schema requires a name. A blank legacy name is recovered from the latest sale snapshot, else a placeholder. */
export function resolveProductName(name: string | null | undefined, legacyId: number, lastSaleSnapshot: string | null): string {
  const trimmed = (name ?? "").trim();
  if (trimmed) return trimmed;
  const snapshot = (lastSaleSnapshot ?? "").trim();
  return snapshot || `(sin nombre) #${legacyId}`;
}

export interface LegacySaleLine {
  id: number;
  ticketId: string;
  fecha: string;
  createdBy: string | null;
  createdAt: string;
  medioPago: string | null;
  observacion: string | null;
  importeCents: number;
  anulada: boolean;
  anuladaAt: string | null;
  anuladaPor: string | null;
  motivoAnulacion: string | null;
}

export interface TicketGroup {
  ticketId: string;
  businessDate: string;
  createdBy: string | null;
  createdAt: string;
  paymentMethodName: string;
  mixedPayment: boolean;
  notes: string;
  total: number;
  status: "CONFIRMED" | "VOIDED";
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  /** Legacy movement ids of the ticket's lines, ascending (line sequence = position * 10). */
  lineIds: number[];
}

const minOf = <T extends string>(values: T[]): T => values.reduce((a, b) => (b < a ? b : a));
const maxOf = (values: string[]): string | null => (values.length ? values.reduce((a, b) => (b > a ? b : a)) : null);

/**
 * Legacy `backfill_sales_models`: one order per ticket; total = sum of ACTIVE lines; status CONFIRMADA while at least one
 * line is active, else ANULADA. Aggregates mirror the legacy MIN/MAX choices so results stay comparable.
 */
export function groupTickets(lines: LegacySaleLine[]): TicketGroup[] {
  const byTicket = new Map<string, LegacySaleLine[]>();
  for (const line of [...lines].sort((a, b) => a.id - b.id)) {
    const bucket = byTicket.get(line.ticketId);
    if (bucket) bucket.push(line);
    else byTicket.set(line.ticketId, [line]);
  }
  return [...byTicket.entries()].map(([ticketId, group]) => {
    const active = group.filter((l) => !l.anulada);
    const methods = [...new Set(group.map((l) => mapPaymentMethod(l.medioPago)?.name ?? "Otro"))];
    const status = active.length > 0 ? "CONFIRMED" : "VOIDED";
    const creators = group.map((l) => l.createdBy).filter((c): c is string => !!c);
    return {
      ticketId,
      businessDate: minOf(group.map((l) => l.fecha)),
      createdBy: creators.length ? minOf(creators) : null,
      createdAt: minOf(group.map((l) => l.createdAt)),
      paymentMethodName: minOf(methods),
      mixedPayment: methods.length > 1,
      notes: maxOf(group.map((l) => l.observacion ?? "")) ?? "",
      total: active.reduce((sum, l) => sum + l.importeCents, 0),
      status,
      voidedAt: status === "VOIDED" ? maxOf(group.map((l) => l.anuladaAt ?? "").filter(Boolean)) : null,
      voidedBy: status === "VOIDED" ? maxOf(group.map((l) => l.anuladaPor ?? "").filter(Boolean)) : null,
      voidReason: status === "VOIDED" ? maxOf(group.map((l) => l.motivoAnulacion ?? "").filter(Boolean)) : null,
      lineIds: group.map((l) => l.id),
    } satisfies TicketGroup;
  }).sort((a, b) => a.lineIds[0] - b.lineIds[0]);
}
