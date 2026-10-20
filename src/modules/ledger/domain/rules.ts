import type { Cents } from "@/shared/domain/money";
import { LedgerError, LedgerPermissionError } from "./errors";
import type { Actor, MovementKind, SaleOrderStatus } from "./types";

/** Stable code of the cash payment method (legacy compared the display name "Efectivo"). */
export const CASH_PAYMENT_CODE = "EFECTIVO";

export const isCashPaymentMethod = (code: string | null | undefined): boolean => code === CASH_PAYMENT_CODE;

/** Line / movement amount: quantity x unit price, rounded to integer cents. */
export function lineAmount(quantity: number, unitPrice: Cents): Cents {
  return Math.round(quantity * unitPrice);
}

/** Legacy ticket id: `YYYYMMDD-` + first 6 hex chars of a uuid, upper-case. */
export function buildTicketId(businessDate: string, uniqueToken: string): string {
  return `${businessDate.replaceAll("-", "")}-${uniqueToken.replaceAll("-", "").slice(0, 6).toUpperCase()}`;
}

/** Legacy `sync_order_state`: an order with no active sale line is voided (total 0); otherwise it keeps the active total. */
export function nextOrderState(active: { activeCount: number; activeTotal: Cents }): {
  status: SaleOrderStatus;
  total: Cents;
} {
  if (active.activeCount === 0) return { status: "VOIDED", total: 0 };
  return { status: "CONFIRMED", total: active.activeTotal };
}

export type CashReversalKind = "sale" | "expense" | "purchase" | "other";

/** Which cash reversal (if any) a voided movement of this kind needs. */
export function cashReversalKind(kind: MovementKind): CashReversalKind {
  if (kind === "Venta") return "sale";
  if (kind === "Gasto") return "expense";
  if (kind === "Compra") return "purchase";
  return "other";
}

export function requireReason(reason: string, message: string): string {
  const clean = reason.trim();
  if (!clean) throw new LedgerError(message);
  return clean;
}

/** Legacy `ensure_permission('admin_access')` message. */
export function assertAdmin(actor: Actor): void {
  if (actor.role !== "admin") throw new LedgerPermissionError("No tenés permisos para acceder a esta función.");
}

export function isValidBusinessDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
