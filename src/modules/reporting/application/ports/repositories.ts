import type { UnitOfWork } from "@/shared/application/unit-of-work";
import type {
  CashAdminSession,
  CashAuditEvent,
  CashLedgerEntry,
  CashSessionHistoryEntry,
  DaySalesTotals,
  ProductStockHistoryRow,
  ReportMovement,
  StockReportProduct,
  TicketLine,
  TicketSummary,
} from "../../domain";

/**
 * Read-only queries over the ledger / catalog / inventory / cash tables (CQRS-lite: the reporting module may join
 * across tables directly instead of calling the write-side modules). Every method returns plain DTOs in cents.
 */
export interface ReportingReader {
  /** Active (not voided) movements with business date in [from, to] (`to` optional = open ended), newest first. */
  listActiveMovements(range: { from: string; to?: string }): Promise<ReportMovement[]>;
  /** Movements of the period, optionally including voided ones, newest first (history screen). */
  listMovements(range: { from: string; to: string; includeVoided: boolean }): Promise<ReportMovement[]>;
  findMovementByNumber(number: number): Promise<ReportMovement | null>;
  /** Active products with their current stock, in display-number order. */
  listActiveProductsWithStock(): Promise<StockReportProduct[]>;
  /** CONFIRMED sale orders of the user for a business date, newest first (`time` is filled by the use case). */
  listUserTickets(userId: string, businessDate: string): Promise<Omit<TicketSummary, "time">[]>;
  /** Active lines of the user's CONFIRMED ticket, in line order. */
  listTicketLines(ticketId: string, userId: string): Promise<TicketLine[]>;
  /** True when ANY user has an open cash session (admin "Cerrar caja" shortcut). */
  hasAnyOpenCashSession(): Promise<boolean>;
  /** Open cash sessions with the cash each one holds, newest first (admin "Cajas"). */
  listOpenCashSessions(): Promise<CashAdminSession[]>;
  /** Non-voided sales (and distinct tickets) of a business date. */
  daySalesTotals(businessDate: string): Promise<DaySalesTotals>;
  /** Latest cash ledger rows of every session, newest first. */
  listCashLedger(limit: number): Promise<CashLedgerEntry[]>;
  /** Latest cash sessions of every user (any status), newest first. */
  listCashSessionHistory(limit: number): Promise<CashSessionHistoryEntry[]>;
  /** Latest open / close audit events, newest first. */
  listCashEvents(limit: number): Promise<CashAuditEvent[]>;
  /** Stock audit rows of one product, newest first (product page "Historial"). */
  listProductStockHistory(productId: string, limit: number): Promise<ProductStockHistoryRow[]>;
}

export interface ReportingRepositories {
  reader: ReportingReader;
}

export type ReportingUnitOfWork = UnitOfWork<ReportingRepositories>;
