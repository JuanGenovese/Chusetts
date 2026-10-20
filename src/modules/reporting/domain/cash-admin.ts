import { formatMoney, type Cents } from "@/shared/domain/money";

/** An open cash session with the cash it holds right now (legacy `turnos_caja` + `SUM(signo * monto)`). */
export interface CashAdminSession {
  id: string;
  /** "Caja #N". */
  number: number;
  openedBy: string; // username
  businessDate: string;
  openedAt: Date;
  cashAvailable: Cents;
}

/** One row of the cash ledger ("Libro de efectivo"; legacy `movimientos_caja`). */
export interface CashLedgerEntry {
  id: string;
  sessionNumber: number;
  occurredAt: Date;
  /** Owner of the session. */
  responsible: string; // username
  type: string; // CashMovementType
  description: string;
  reason: string;
  amount: Cents;
  sign: number;
  balanceAfter: Cents;
  actor: string; // username
}

/** One row of the sessions history ("Cierres y auditoría"; legacy `turnos_caja`). */
export interface CashSessionHistoryEntry {
  id: string;
  number: number;
  businessDate: string;
  openedBy: string; // username
  status: "OPEN" | "CLOSED";
  openedAt: Date;
  closedAt: Date | null;
  difference: Cents | null;
}

/** One audit event of a session (legacy `eventos_turno_caja`). */
export interface CashAuditEvent {
  id: string;
  sessionNumber: number;
  type: string; // CashEventType
  actor: string; // username
  occurredAt: Date;
  detail: Record<string, unknown>;
}

/** Non-voided sales of a business date (legacy "Ventas de hoy" / "Tickets de hoy"). */
export interface DaySalesTotals {
  sales: Cents;
  tickets: number;
}

export interface CashAdminOverview {
  businessDate: string;
  openSessions: CashAdminSession[];
  /** Sum of the cash held by every open session. */
  cashAvailable: Cents;
  today: DaySalesTotals;
  ledger: CashLedgerEntry[];
  history: CashSessionHistoryEntry[];
  events: CashAuditEvent[];
}

/** Legacy record_list limits of the admin cash page. */
export const CASH_LEDGER_LIMIT = 300;
export const CASH_HISTORY_LIMIT = 100;
export const CASH_EVENTS_LIMIT = 200;

/** Legacy `tipo.replace("_", " ").title()` of the Spanish cash movement codes. */
const MOVEMENT_TITLES: Record<string, string> = {
  OPENING: "Apertura",
  MANUAL_INCOME: "Ingreso Manual",
  WITHDRAWAL: "Retiro",
  CASH_EXPENSE: "Gasto Efectivo",
  POSITIVE_ADJUSTMENT: "Ajuste Positivo",
  NEGATIVE_ADJUSTMENT: "Ajuste Negativo",
  CASH_SALE: "Venta Efectivo",
  CASH_OUTFLOW: "Egreso Efectivo",
  SALE_REFUND: "Devolucion Efectivo",
  OUTFLOW_REVERSAL: "Reversa Egreso",
  CLOSING: "Cierre",
};

export const cashMovementTitle = (type: string): string => MOVEMENT_TITLES[type] ?? type;

/** Legacy `("− " if signo < 0 else "+ ") + money(monto)`. */
export const signedAmount = (sign: number, amount: Cents): string => `${sign < 0 ? "− " : "+ "}${formatMoney(amount)}`;

/** Legacy event codes (`APERTURA`, `CIERRE`). */
const EVENT_CODES: Record<string, string> = { OPENING: "APERTURA", CLOSING: "CIERRE" };

export const cashEventCode = (type: string): string => EVENT_CODES[type] ?? type;

export const sessionStatusLabel = (status: "OPEN" | "CLOSED"): string => (status === "OPEN" ? "ABIERTO" : "CERRADO");

const DETAIL_LABELS: Record<string, string> = {
  openingCash: "Efectivo inicial",
  expectedCash: "Esperado",
  countedCash: "Contado",
  difference: "Diferencia",
  electronicTotal: "Electrónico",
  notes: "Notas",
};

/** Readable audit detail: money fields (cents) formatted, empty values dropped. */
export function formatEventDetail(detail: Record<string, unknown>): string {
  return Object.entries(detail)
    .filter(([, value]) => value !== "" && value !== null && value !== undefined)
    .map(([key, value]) => `${DETAIL_LABELS[key] ?? key}: ${typeof value === "number" ? formatMoney(value) : String(value)}`)
    .join(" · ");
}
