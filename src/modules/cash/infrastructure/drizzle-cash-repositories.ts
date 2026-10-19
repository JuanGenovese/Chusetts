import { asc, eq, sql } from "drizzle-orm";
import { PG_UNIQUE_VIOLATION, pgErrorInfo } from "@/shared/infrastructure/db/errors";
import type { DbExecutor } from "@/shared/infrastructure/db/client";
import { cashEvents, cashMovements, cashSessions } from "@/shared/infrastructure/db/schema";
import {
  CashSessionError,
  type AmountsByMethod,
  type CashEvent,
  type CashMovement,
  type CashSession,
} from "../domain";
import type {
  CashEventRepository,
  CashMovementRepository,
  CashRepositories,
  CashSessionRepository,
  SessionLedgerReader,
} from "../application/ports";

type SessionRow = typeof cashSessions.$inferSelect;
type MovementRow = typeof cashMovements.$inferSelect;

function amountsFromRow(
  row: SessionRow,
  prefix: "expected" | "counted",
): AmountsByMethod | null {
  const cash = row[`${prefix}Cash`];
  if (cash === null) return null;
  return {
    cash,
    transfer: row[`${prefix}Transfer`] ?? 0,
    card: row[`${prefix}Card`] ?? 0,
    mercado_pago: row[`${prefix}MercadoPago`] ?? 0,
    other: row[`${prefix}Other`] ?? 0,
  };
}

function toSession(row: SessionRow): CashSession {
  return {
    id: row.id,
    businessDate: row.businessDate,
    openedBy: row.openedBy,
    openedAt: row.openedAt,
    openingCash: row.openingCash,
    status: row.status,
    closedBy: row.closedBy,
    closedAt: row.closedAt,
    expectedAmounts: amountsFromRow(row, "expected"),
    countedAmounts: amountsFromRow(row, "counted"),
    difference: row.difference,
    openingNotes: row.openingNotes,
    closingNotes: row.closingNotes,
    updatedAt: row.updatedAt,
  };
}

function sessionValues(s: CashSession) {
  return {
    businessDate: s.businessDate,
    openedBy: s.openedBy,
    openedAt: s.openedAt,
    openingCash: s.openingCash,
    status: s.status,
    closedBy: s.closedBy,
    closedAt: s.closedAt,
    expectedCash: s.expectedAmounts?.cash ?? null,
    expectedTransfer: s.expectedAmounts?.transfer ?? null,
    expectedCard: s.expectedAmounts?.card ?? null,
    expectedMercadoPago: s.expectedAmounts?.mercado_pago ?? null,
    expectedOther: s.expectedAmounts?.other ?? null,
    countedCash: s.countedAmounts?.cash ?? null,
    countedTransfer: s.countedAmounts?.transfer ?? null,
    countedCard: s.countedAmounts?.card ?? null,
    countedMercadoPago: s.countedAmounts?.mercado_pago ?? null,
    countedOther: s.countedAmounts?.other ?? null,
    difference: s.difference,
    openingNotes: s.openingNotes,
    closingNotes: s.closingNotes,
    updatedAt: s.updatedAt,
  };
}

function toMovement(row: MovementRow): CashMovement {
  return {
    id: row.id,
    sessionId: row.sessionId,
    occurredAt: row.occurredAt,
    actor: row.actorId,
    type: row.type,
    amount: row.amount,
    sign: row.sign as CashMovement["sign"],
    description: row.description,
    reason: row.reason,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    referenceKey: row.referenceKey,
    balanceBefore: row.balanceBefore,
    balanceAfter: row.balanceAfter,
  };
}

class DrizzleCashSessionRepository implements CashSessionRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(id: string, options?: { lock?: boolean }) {
    const query = this.db.select().from(cashSessions).where(eq(cashSessions.id, id)).limit(1);
    const [row] = options?.lock ? await query.for("update") : await query;
    return row ? toSession(row) : null;
  }

  async findOpenByUser(userId: string) {
    const [row] = await this.db
      .select()
      .from(cashSessions)
      .where(sql`${cashSessions.openedBy} = ${userId} and ${cashSessions.status} = 'OPEN'`)
      .limit(1);
    return row ? toSession(row) : null;
  }

  async insert(session: CashSession) {
    try {
      await this.db.insert(cashSessions).values({ id: session.id, ...sessionValues(session) });
    } catch (error) {
      const { code, constraint } = pgErrorInfo(error);
      if (code === PG_UNIQUE_VIOLATION && constraint === "ux_cash_sessions_one_open_per_user") {
        throw new CashSessionError("El usuario ya tiene una caja abierta.");
      }
      throw error;
    }
  }

  async update(session: CashSession, expectedStatus: CashSession["status"]) {
    try {
      const rows = await this.db
        .update(cashSessions)
        .set(sessionValues(session))
        .where(sql`${cashSessions.id} = ${session.id} and ${cashSessions.status} = ${expectedStatus}`)
        .returning({ id: cashSessions.id });
      return rows.length === 1;
    } catch (error) {
      const { code, constraint } = pgErrorInfo(error);
      if (code === PG_UNIQUE_VIOLATION && constraint === "ux_cash_sessions_one_open_per_user") {
        throw new CashSessionError("El usuario ya tiene otra caja abierta.");
      }
      throw error;
    }
  }
}

class DrizzleCashMovementRepository implements CashMovementRepository {
  constructor(private readonly db: DbExecutor) {}

  async balance(sessionId: string) {
    const [row] = await this.db
      .select({ balance: sql<number>`coalesce(sum(${cashMovements.sign} * ${cashMovements.amount}), 0)`.mapWith(Number) })
      .from(cashMovements)
      .where(eq(cashMovements.sessionId, sessionId));
    return row?.balance ?? 0;
  }

  async existsByReferenceKey(key: string) {
    const rows = await this.db
      .select({ id: cashMovements.id })
      .from(cashMovements)
      .where(eq(cashMovements.referenceKey, key))
      .limit(1);
    return rows.length > 0;
  }

  async insert(m: CashMovement) {
    try {
      await this.db.insert(cashMovements).values({
        id: m.id,
        sessionId: m.sessionId,
        occurredAt: m.occurredAt,
        actorId: m.actor,
        type: m.type,
        amount: m.amount,
        sign: m.sign,
        description: m.description,
        reason: m.reason,
        referenceType: m.referenceType,
        referenceId: m.referenceId,
        referenceKey: m.referenceKey,
        balanceBefore: m.balanceBefore,
        balanceAfter: m.balanceAfter,
      });
    } catch (error) {
      if (pgErrorInfo(error).code === PG_UNIQUE_VIOLATION) {
        throw new CashSessionError("Este movimiento ya impactó la caja.");
      }
      throw error;
    }
  }

  async listBySession(sessionId: string) {
    const rows = await this.db
      .select()
      .from(cashMovements)
      .where(eq(cashMovements.sessionId, sessionId))
      .orderBy(asc(cashMovements.occurredAt), asc(cashMovements.id));
    return rows.map(toMovement);
  }
}

class DrizzleCashEventRepository implements CashEventRepository {
  constructor(private readonly db: DbExecutor) {}

  async insert(e: CashEvent) {
    await this.db.insert(cashEvents).values({
      id: e.id,
      sessionId: e.sessionId,
      type: e.type,
      actorId: e.actor,
      occurredAt: e.occurredAt,
      detail: e.detail,
    });
  }

  async listBySession(sessionId: string) {
    const rows = await this.db
      .select()
      .from(cashEvents)
      .where(eq(cashEvents.sessionId, sessionId))
      .orderBy(asc(cashEvents.occurredAt));
    return rows.map(
      (r): CashEvent => ({
        id: r.id,
        sessionId: r.sessionId,
        type: r.type,
        actor: r.actorId,
        occurredAt: r.occurredAt,
        detail: r.detail,
      }),
    );
  }
}

/**
 * Phase 1 stub: the sales ledger does not exist yet, so a session has no sales.
 * TODO(phase-4): query the sales module's tables (non-voided rows, grouped by payment method / kind).
 */
class EmptySessionLedgerReader implements SessionLedgerReader {
  async nonCashTotals() {
    return [];
  }
  async salesSummary() {
    return { sales: 0, cashSales: 0, electronicSales: 0, tickets: 0 };
  }
}

export function createCashRepositories(db: DbExecutor): CashRepositories {
  return {
    sessions: new DrizzleCashSessionRepository(db),
    movements: new DrizzleCashMovementRepository(db),
    events: new DrizzleCashEventRepository(db),
    ledger: new EmptySessionLedgerReader(),
  };
}
