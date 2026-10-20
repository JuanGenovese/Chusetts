import type { Cents } from "@/shared/domain/money";
import type {
  ExpensesByCategory,
  PeriodSummary,
  ReportMovement,
  SalesByDay,
  SalesByPaymentMethod,
  StockReport,
  StockReportProduct,
  StockReportRow,
  TicketSummary,
} from "./types";

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const isExpense = (m: ReportMovement) => m.kind === "Gasto" || m.kind === "Compra";

function groupSum<K extends string>(rows: ReportMovement[], key: (m: ReportMovement) => K | null): Map<K, Cents> {
  const totals = new Map<K, Cents>();
  for (const row of rows) {
    const k = key(row);
    if (k !== null) totals.set(k, (totals.get(k) ?? 0) + row.amount);
  }
  return totals;
}

/** Legacy `resumen_periodo` over already-filtered ACTIVE movements. */
export function summarizeMovements(movements: ReportMovement[]): PeriodSummary {
  const sales = movements.filter((m) => m.kind === "Venta").reduce((sum, m) => sum + m.amount, 0);
  const expenses = movements.filter(isExpense).reduce((sum, m) => sum + m.amount, 0);
  const result = sales - expenses;
  return { movements, sales, expenses, result, margin: sales ? result / sales : 0 };
}

/** Sales per payment method, alphabetical (pandas `groupby` order); rows without a method are dropped. */
export function salesByPaymentMethod(movements: ReportMovement[]): SalesByPaymentMethod[] {
  const totals = groupSum(movements.filter((m) => m.kind === "Venta"), (m) => m.paymentMethod);
  return [...totals].sort(([a], [b]) => byText(a, b)).map(([paymentMethod, amount]) => ({ paymentMethod, amount }));
}

/** Sales per business date, chronological. */
export function salesByDay(movements: ReportMovement[]): SalesByDay[] {
  const totals = groupSum(movements.filter((m) => m.kind === "Venta"), (m) => m.businessDate);
  return [...totals].sort(([a], [b]) => byText(a, b)).map(([date, amount]) => ({ date, amount }));
}

/** Gasto + Compra per category, biggest first; rows without a category are dropped (pandas `groupby`). */
export function expensesByCategory(movements: ReportMovement[]): ExpensesByCategory[] {
  const totals = groupSum(movements.filter(isExpense), (m) => m.category);
  return [...totals]
    .sort(([ca, a], [cb, b]) => b - a || byText(ca, cb))
    .map(([category, amount]) => ({ category, amount }));
}

/** `today.replace(day=1)`. */
export function monthStartOf(businessDate: string): string {
  return `${businessDate.slice(0, 8)}01`;
}

/** Stock tab: legacy `CASE WHEN stock_actual <= stock_minimo THEN 'Crítico' ELSE 'OK'`, ordered by status then stock. */
export function buildStockReport(products: StockReportProduct[]): StockReport {
  if (products.length === 0) return { isEmpty: true, activeProducts: 0, criticalCount: 0, averageUnitMargin: 0, products: [] };
  const rows = [...products]
    .map((p) => ({ number: p.number, row: toStockRow(p) }))
    .sort(
      (a, b) =>
        byText(a.row.status, b.row.status) || a.row.stock - b.row.stock || a.number - b.number,
    )
    .map((x) => x.row);
  const totalMargin = rows.reduce((sum, r) => sum + r.unitMargin, 0);
  return {
    isEmpty: false,
    activeProducts: rows.length,
    criticalCount: rows.filter((r) => r.status === "Crítico").length,
    averageUnitMargin: Math.round(totalMargin / rows.length),
    products: rows,
  };
}

function toStockRow(p: StockReportProduct): StockReportRow {
  return {
    name: p.name,
    categoryName: p.categoryName,
    stock: p.stock,
    minStock: p.minStock,
    salePrice: p.salePrice,
    unitCost: p.unitCost,
    unitMargin: p.salePrice - p.unitCost,
    status: p.stock <= p.minStock ? "Crítico" : "OK",
  };
}

/** Cashier home KPIs: total, number of tickets and average ticket. */
export function summarizeTickets(tickets: TicketSummary[]): { sales: Cents; ticketCount: number; averageTicket: Cents } {
  const sales = tickets.reduce((sum, t) => sum + t.total, 0);
  return { sales, ticketCount: tickets.length, averageTicket: tickets.length ? Math.round(sales / tickets.length) : 0 };
}
