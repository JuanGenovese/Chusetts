import type { Clock } from "@/shared/application/runtime";
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
import type { ReportingReader, ReportingUnitOfWork } from "../ports/repositories";

/** In-memory reader for unit tests: filters/sorts like the SQL adapter does. */
export class InMemoryReportingStore {
  movements: ReportMovement[] = [];
  products: StockReportProduct[] = [];
  tickets: (Omit<TicketSummary, "time"> & { userId: string; businessDate: string })[] = [];
  lines: (TicketLine & { ticketId: string; userId: string })[] = [];
  openSessions = 0;
  cashAdminOpenSessions: CashAdminSession[] = [];
  daySales: Record<string, DaySalesTotals> = {};
  cashLedger: CashLedgerEntry[] = [];
  cashHistory: CashSessionHistoryEntry[] = [];
  cashEvents: CashAuditEvent[] = [];
  /** Insertion order = oldest first (the reader returns newest first). */
  stockHistory: (ProductStockHistoryRow & { productId: string })[] = [];
  calls: string[] = [];

  reader(): ReportingReader {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- fakes close over the store
    const s = this;
    const newestFirst = (rows: ReportMovement[]) =>
      [...rows].sort((a, b) => (a.businessDate < b.businessDate ? 1 : a.businessDate > b.businessDate ? -1 : b.number - a.number));
    return {
      async listActiveMovements({ from, to }) {
        s.calls.push(`active:${from}:${to ?? ""}`);
        return newestFirst(s.movements.filter((m) => !m.voided && m.businessDate >= from && (!to || m.businessDate <= to)));
      },
      async listMovements({ from, to, includeVoided }) {
        return newestFirst(s.movements.filter((m) => m.businessDate >= from && m.businessDate <= to && (includeVoided || !m.voided)));
      },
      async findMovementByNumber(number) {
        return s.movements.find((m) => m.number === number) ?? null;
      },
      async listActiveProductsWithStock() {
        return [...s.products];
      },
      async listUserTickets(userId, businessDate) {
        return s.tickets
          .filter((t) => t.userId === userId && t.businessDate === businessDate)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map((t) => ({ ticketId: t.ticketId, createdAt: t.createdAt, total: t.total, items: t.items }));
      },
      async listTicketLines(ticketId, userId) {
        return s.lines.filter((l) => l.ticketId === ticketId && l.userId === userId).map((l) => ({ productName: l.productName, quantity: l.quantity, unitPrice: l.unitPrice, amount: l.amount }));
      },
      async hasAnyOpenCashSession() {
        return s.openSessions > 0;
      },
      async listOpenCashSessions() {
        return [...s.cashAdminOpenSessions];
      },
      async daySalesTotals(businessDate) {
        return s.daySales[businessDate] ?? { sales: 0, tickets: 0 };
      },
      async listCashLedger(limit) {
        s.calls.push(`ledger:${limit}`);
        return s.cashLedger.slice(0, limit);
      },
      async listCashSessionHistory(limit) {
        s.calls.push(`history:${limit}`);
        return s.cashHistory.slice(0, limit);
      },
      async listCashEvents(limit) {
        s.calls.push(`events:${limit}`);
        return s.cashEvents.slice(0, limit);
      },
      async listProductStockHistory(productId, limit) {
        return s.stockHistory
          .filter((h) => h.productId === productId)
          .reverse()
          .slice(0, limit)
          .map((entry) => {
            const row: Partial<typeof entry> = { ...entry };
            delete row.productId;
            return row as ProductStockHistoryRow;
          });
      },
    };
  }

  unitOfWork(): ReportingUnitOfWork {
    return { run: (work) => work({ reader: this.reader() }) };
  }
}

export class FixedClock implements Clock {
  constructor(
    private current = new Date("2026-08-30T15:00:00Z"),
    private date = "2026-08-30",
  ) {}
  now() {
    return new Date(this.current);
  }
  businessDate() {
    return this.date;
  }
}

export function makeReportingTestDeps() {
  const store = new InMemoryReportingStore();
  return { store, deps: { uow: store.unitOfWork(), clock: new FixedClock() } };
}
