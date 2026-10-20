import type { Cents } from "@/shared/domain/money";

/** Legacy `movimientos.tipo` values (user-visible Spanish data). */
export type ReportMovementKind = "Venta" | "Gasto" | "Compra" | "Ajuste Stock";

/** A ledger row as the screens list it (legacy `movimientos` columns; money in cents). */
export interface ReportMovement {
  id: string;
  /** Legacy numeric id (display, "Anular movimiento individual" lookup). */
  number: number;
  businessDate: string; // YYYY-MM-DD
  kind: ReportMovementKind;
  category: string | null;
  description: string;
  productName: string | null;
  quantity: number;
  unitPrice: Cents;
  amount: Cents;
  /** Payment method display name snapshot (legacy `medio_pago`). */
  paymentMethod: string | null;
  supplier: string;
  notes: string;
  /** Legacy `created_by` (username). */
  createdByUsername: string;
  createdAt: Date;
  voided: boolean;
  voidReason: string | null;
  ticketId: string | null;
}

/** Legacy `resumen_periodo` result. `margin` is a ratio (0.25 = 25%). */
export interface PeriodSummary {
  /** Active (not voided) movements of the period, newest first (business date desc, number desc). */
  movements: ReportMovement[];
  sales: Cents;
  /** Gasto + Compra. */
  expenses: Cents;
  result: Cents;
  margin: number;
}

export interface TicketSummary {
  ticketId: string;
  createdAt: Date;
  /** "HH:MM:SS" in the business time zone (legacy `str(hora)[11:19]`). */
  time: string;
  total: Cents;
  /** Sum of the quantities of the ticket's active lines. */
  items: number;
}

export interface TicketLine {
  productName: string;
  quantity: number;
  unitPrice: Cents;
  amount: Cents;
}

/** An active product with its current stock, as the Stock tab needs it. */
export interface StockReportProduct {
  /** Display number: tie-break that mirrors the legacy row order. */
  number: number;
  name: string;
  categoryName: string | null;
  stock: number;
  minStock: number;
  salePrice: Cents;
  unitCost: Cents;
}

export type StockStatus = "Crítico" | "OK";

export interface StockReportRow {
  name: string;
  categoryName: string | null;
  stock: number;
  minStock: number;
  salePrice: Cents;
  unitCost: Cents;
  unitMargin: Cents;
  status: StockStatus;
}

export interface StockReport {
  isEmpty: boolean;
  activeProducts: number;
  criticalCount: number;
  averageUnitMargin: Cents;
  /** Critical first, then by stock ascending. */
  products: StockReportRow[];
}

export interface SalesByPaymentMethod {
  paymentMethod: string;
  amount: Cents;
}
export interface SalesByDay {
  date: string;
  amount: Cents;
}
export interface ExpensesByCategory {
  category: string;
  amount: Cents;
}

/** "Hoy" tab (and the KPI cards of the admin home). */
export interface DashboardToday {
  date: string;
  sales: Cents;
  expenses: Cents;
  result: Cents;
  margin: number;
  /** No movement today: the screen shows "Todavía no hay movimientos cargados hoy.". */
  isEmpty: boolean;
  salesByPaymentMethod: SalesByPaymentMethod[];
  /** First 12 movements of the day. */
  recentMovements: ReportMovement[];
}

/** "Mes actual" tab: from the first day of the month, with no upper bound (like the legacy). */
export interface DashboardMonth {
  from: string;
  sales: Cents;
  expenses: Cents;
  result: Cents;
  margin: number;
  isEmpty: boolean;
  salesByDay: SalesByDay[];
  expensesByCategory: ExpensesByCategory[];
  /** First 20 movements of the month. */
  recentMovements: ReportMovement[];
}

export interface AdminDashboard {
  businessDate: string;
  today: DashboardToday;
  month: DashboardMonth;
  stock: StockReport;
}

export interface CashierHome {
  businessDate: string;
  tickets: TicketSummary[];
  sales: Cents;
  ticketCount: number;
  averageTicket: Cents;
}

/** One audit row of a product's stock (legacy `movimientos_stock` joined with the actor's username). */
export interface ProductStockHistoryRow {
  id: string;
  createdAt: Date;
  /** Legacy code (CONSUMO_VENTA, AJUSTE_FISICO, ...): shown as is, like the legacy history. */
  type: string;
  quantityDelta: number;
  stockBefore: number;
  stockAfter: number;
  reason: string;
  actorUsername: string;
}
