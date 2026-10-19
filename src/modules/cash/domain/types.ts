import type { Cents } from "@/shared/domain/money";

export const PAYMENT_METHODS = ["cash", "transfer", "card", "mercado_pago", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Spanish labels (legacy values: Efectivo, Transferencia, Tarjeta, Mercado Pago, Otro). */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
  mercado_pago: "Mercado Pago",
  other: "Otro",
};

export type AmountsByMethod = Record<PaymentMethod, Cents>;

export type CashSessionStatus = "OPEN" | "CLOSED";

export interface CashSession {
  id: string;
  businessDate: string; // YYYY-MM-DD
  openedBy: string; // user id
  openedAt: Date;
  openingCash: Cents;
  status: CashSessionStatus;
  closedBy: string | null;
  closedAt: Date | null;
  expectedAmounts: AmountsByMethod | null;
  countedAmounts: AmountsByMethod | null;
  difference: Cents | null;
  openingNotes: string;
  closingNotes: string;
  updatedAt: Date;
}

/** Legacy: APERTURA, INGRESO_MANUAL, RETIRO, GASTO_EFECTIVO, AJUSTE_POSITIVO, AJUSTE_NEGATIVO,
 *  VENTA_EFECTIVO, EGRESO_EFECTIVO, DEVOLUCION_EFECTIVO, REVERSA_EGRESO, CIERRE. */
export const CASH_MOVEMENT_TYPES = [
  "OPENING",
  "MANUAL_INCOME",
  "WITHDRAWAL",
  "CASH_EXPENSE",
  "POSITIVE_ADJUSTMENT",
  "NEGATIVE_ADJUSTMENT",
  "CASH_SALE",
  "CASH_OUTFLOW",
  "SALE_REFUND",
  "OUTFLOW_REVERSAL",
  "CLOSING",
] as const;
export type CashMovementType = (typeof CASH_MOVEMENT_TYPES)[number];

export type MovementSign = -1 | 0 | 1;

export interface CashMovement {
  id: string;
  sessionId: string;
  occurredAt: Date;
  actor: string; // user id
  type: CashMovementType;
  amount: Cents; // always >= 0; direction comes from `sign`
  sign: MovementSign;
  description: string;
  reason: string;
  referenceType: string | null;
  referenceId: string | null;
  /** Idempotency key: at most one cash movement per key (e.g. "MOVEMENT:<id>"). */
  referenceKey: string | null;
  balanceBefore: Cents;
  balanceAfter: Cents;
}

export type CashEventType = "OPENING" | "CLOSING";

export interface CashEvent {
  id: string;
  sessionId: string;
  type: CashEventType;
  actor: string;
  occurredAt: Date;
  detail: Record<string, unknown>;
}

/** Non-cash totals of the sales ledger for a session (provided by the sales module via a port). */
export interface PaymentTotal {
  paymentMethod: string;
  kind: "sale" | "expense" | "purchase";
  total: Cents;
}

export interface SalesSummary {
  sales: Cents;
  cashSales: Cents;
  electronicSales: Cents;
  tickets: number;
}

export type UserRole = "admin" | "cashier";
