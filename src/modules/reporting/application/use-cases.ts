import { formatTimestamp } from "@/shared/domain/datetime";
import {
  CASH_EVENTS_LIMIT,
  CASH_HISTORY_LIMIT,
  CASH_LEDGER_LIMIT,
  buildStockReport,
  expensesByCategory,
  monthStartOf,
  salesByDay,
  salesByPaymentMethod,
  summarizeMovements,
  summarizeTickets,
  type AdminDashboard,
  type CashAdminOverview,
  type CashierHome,
  type PeriodSummary,
  type ProductStockHistoryRow,
  type ReportMovement,
  type TicketLine,
  type TicketSummary,
} from "../domain";
import type { ReportingDeps } from "./deps";
import type { ReportingReader } from "./ports/repositories";

/** Legacy dashboard limits: the "Hoy" list shows 12 rows, the "Mes actual" list 20. */
const RECENT_TODAY = 12;
const RECENT_MONTH = 20;
/** Legacy `get_stock_movements(limit=200)`. */
const PRODUCT_HISTORY_LIMIT = 200;

async function userTickets(reader: ReportingReader, userId: string, businessDate: string): Promise<TicketSummary[]> {
  const tickets = await reader.listUserTickets(userId, businessDate);
  // Legacy `str(hora)[11:19]`: the time part of the local timestamp.
  return tickets.map((t) => ({ ...t, time: formatTimestamp(t.createdAt).slice(11, 19) }));
}

/**
 * Read-only use cases for the "/" screens of both roles and the movements history (CQRS-lite).
 * Money is integer cents everywhere; nothing here writes.
 */
export const reportingUseCases = (deps: ReportingDeps) => {
  const read = <T>(work: (reader: ReportingReader) => Promise<T>): Promise<T> => deps.uow.run((repos) => work(repos.reader));

  return {
    /** Legacy `resumen_periodo(desde, hasta?)`. Business dates are inclusive; `to` omitted = open ended. */
    getPeriodSummary: (input: { from: string; to?: string }): Promise<PeriodSummary> =>
      read(async (reader) => summarizeMovements(await reader.listActiveMovements(input))),

    /** Everything `admin_home` KPIs + `dashboard_content()` (Hoy / Mes actual / Stock tabs) need, in one read. */
    getAdminDashboard: (): Promise<AdminDashboard> =>
      read(async (reader) => {
        const businessDate = deps.clock.businessDate();
        const monthStart = monthStartOf(businessDate);
        const [todayRows, monthRows, products] = await Promise.all([
          reader.listActiveMovements({ from: businessDate, to: businessDate }),
          reader.listActiveMovements({ from: monthStart }),
          reader.listActiveProductsWithStock(),
        ]);
        const today = summarizeMovements(todayRows);
        const month = summarizeMovements(monthRows);
        return {
          businessDate,
          today: {
            date: businessDate,
            sales: today.sales,
            expenses: today.expenses,
            result: today.result,
            margin: today.margin,
            isEmpty: todayRows.length === 0,
            salesByPaymentMethod: salesByPaymentMethod(todayRows),
            recentMovements: todayRows.slice(0, RECENT_TODAY),
          },
          month: {
            from: monthStart,
            sales: month.sales,
            expenses: month.expenses,
            result: month.result,
            margin: month.margin,
            isEmpty: monthRows.length === 0,
            salesByDay: salesByDay(monthRows),
            expensesByCategory: expensesByCategory(monthRows),
            recentMovements: monthRows.slice(0, RECENT_MONTH),
          },
          stock: buildStockReport(products),
        };
      }),

    /** Legacy `get_tickets_usuario`: the user's CONFIRMED tickets of a business date (default today), newest first. */
    listUserTickets: (input: { userId: string; businessDate?: string }): Promise<TicketSummary[]> =>
      read((reader) => userTickets(reader, input.userId, input.businessDate ?? deps.clock.businessDate())),

    /** `cashier_home` KPIs + "Últimos tickets" table. */
    getCashierHome: (input: { userId: string; businessDate?: string }): Promise<CashierHome> =>
      read(async (reader) => {
        const businessDate = input.businessDate ?? deps.clock.businessDate();
        const tickets = await userTickets(reader, input.userId, businessDate);
        return { businessDate, tickets, ...summarizeTickets(tickets) };
      }),

    /** Legacy `get_detalle_ticket`: lines of the user's own ticket (active lines only). */
    getTicketDetail: (input: { ticketId: string; userId: string }): Promise<TicketLine[]> =>
      read((reader) => reader.listTicketLines(input.ticketId, input.userId)),

    /** Legacy `get_movimientos_periodo` (history screen). */
    listMovements: (input: { from: string; to: string; includeVoided: boolean }): Promise<ReportMovement[]> =>
      read((reader) => reader.listMovements(input)),

    /** Legacy `get_movimiento_por_id` (by the legacy numeric id). */
    findMovementByNumber: (number: number): Promise<ReportMovement | null> => read((reader) => reader.findMovementByNumber(number)),

    /** Everything the admin cash page ("Administración de caja") shows: open sessions, ledger, history and audit. */
    getCashAdminOverview: (): Promise<CashAdminOverview> =>
      read(async (reader) => {
        const businessDate = deps.clock.businessDate();
        const [openSessions, today, ledger, history, events] = await Promise.all([
          reader.listOpenCashSessions(),
          reader.daySalesTotals(businessDate),
          reader.listCashLedger(CASH_LEDGER_LIMIT),
          reader.listCashSessionHistory(CASH_HISTORY_LIMIT),
          reader.listCashEvents(CASH_EVENTS_LIMIT),
        ]);
        const cashAvailable = openSessions.reduce((total, s) => total + s.cashAvailable, 0);
        return { businessDate, openSessions, cashAvailable, today, ledger, history, events };
      }),

    /** Legacy `get_stock_movements`: a product's stock audit trail, newest first (default 200 rows). */
    listProductStockHistory: (input: { productId: string; limit?: number }): Promise<ProductStockHistoryRow[]> =>
      read((reader) => reader.listProductStockHistory(input.productId, input.limit ?? PRODUCT_HISTORY_LIMIT)),

    /** True when any user has an open cash session ("Cerrar caja" quick action). */
    hasAnyOpenCashSession: (): Promise<boolean> => read((reader) => reader.hasAnyOpenCashSession()),
  };
};

export type ReportingUseCases = ReturnType<typeof reportingUseCases>;
