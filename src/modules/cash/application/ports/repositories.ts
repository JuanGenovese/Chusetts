import type { Cents } from "@/shared/domain/money";
import type { UnitOfWork } from "@/shared/application/unit-of-work";
import type {
  CashEvent,
  CashMovement,
  CashSession,
  CashSessionStatus,
  PaymentTotal,
  SalesSummary,
} from "../../domain";

export interface CashSessionRepository {
  /** `lock: true` must acquire a row lock (SELECT ... FOR UPDATE) so balance + insert are serialized. */
  findById(id: string, options?: { lock?: boolean }): Promise<CashSession | null>;
  findOpenByUser(userId: string): Promise<CashSession | null>;
  /** Most recent sessions of a user (any status), newest first. */
  listRecentByUser(userId: string, limit: number): Promise<CashSession[]>;
  /** Must throw CashSessionError("El usuario ya tiene una caja abierta.") if the one-open-per-user invariant is violated. */
  insert(session: CashSession): Promise<void>;
  /** Optimistic update guarded by the previous status. Returns false when no row matched (concurrent change). */
  update(session: CashSession, expectedStatus: CashSessionStatus): Promise<boolean>;
}

export interface CashMovementRepository {
  /** Signed sum of the session's movements. */
  balance(sessionId: string): Promise<Cents>;
  existsByReferenceKey(key: string): Promise<boolean>;
  /** Must throw CashSessionError("Este movimiento ya impactó la caja.") on a duplicate reference key. */
  insert(movement: CashMovement): Promise<void>;
  listBySession(sessionId: string): Promise<CashMovement[]>;
}

export interface CashEventRepository {
  insert(event: CashEvent): Promise<void>;
  listBySession(sessionId: string): Promise<CashEvent[]>;
}

/**
 * Read-only view over the movements ledger (owned by the ledger module). The cash repositories default to an empty
 * adapter; the composition root plugs in the ledger-backed one.
 */
export interface SessionLedgerReader {
  /** Non-cash, non-voided totals grouped by payment method and kind. */
  nonCashTotals(sessionId: string): Promise<PaymentTotal[]>;
  salesSummary(sessionId: string): Promise<SalesSummary>;
}

export interface CashRepositories {
  sessions: CashSessionRepository;
  movements: CashMovementRepository;
  events: CashEventRepository;
  ledger: SessionLedgerReader;
}

export type CashUnitOfWork = UnitOfWork<CashRepositories>;
