import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";

// Money columns are INTEGER CENTS (bigint, mode "number").
const cents = (name: string) => bigint(name, { mode: "number" });

export const cashSessionStatus = pgEnum("cash_session_status", ["OPEN", "CLOSED"]);
export const cashEventType = pgEnum("cash_event_type", ["OPENING", "CLOSING"]);
export const cashMovementType = pgEnum("cash_movement_type", [
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
]);

/** Legacy: turnos_caja */
export const cashSessions = pgTable(
  "cash_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessDate: date("business_date", { mode: "string" }).notNull(),
    openedBy: uuid("opened_by").notNull().references(() => users.id),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    openingCash: cents("opening_cash").notNull().default(0),
    status: cashSessionStatus("status").notNull().default("OPEN"),
    closedBy: uuid("closed_by").references(() => users.id),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    expectedCash: cents("expected_cash"),
    expectedTransfer: cents("expected_transfer"),
    expectedCard: cents("expected_card"),
    expectedMercadoPago: cents("expected_mercado_pago"),
    expectedOther: cents("expected_other"),
    countedCash: cents("counted_cash"),
    countedTransfer: cents("counted_transfer"),
    countedCard: cents("counted_card"),
    countedMercadoPago: cents("counted_mercado_pago"),
    countedOther: cents("counted_other"),
    difference: cents("difference"),
    openingNotes: text("opening_notes").notNull().default(""),
    closingNotes: text("closing_notes").notNull().default(""),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    check("cash_sessions_opening_cash_non_negative", sql`${t.openingCash} >= 0`),
    // Legacy ux_turno_abierto_por_usuario: at most one OPEN session per user.
    uniqueIndex("ux_cash_sessions_one_open_per_user").on(t.openedBy).where(sql`${t.status} = 'OPEN'`),
    index("ix_cash_sessions_date_status").on(t.businessDate, t.status),
  ],
);

/** Legacy: movimientos_caja (append-only cash ledger; `sign` gives the direction). */
export const cashMovements = pgTable(
  "cash_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull().references(() => cashSessions.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    actorId: uuid("actor_id").notNull().references(() => users.id),
    type: cashMovementType("type").notNull(),
    amount: cents("amount").notNull(),
    sign: smallint("sign").notNull(),
    description: text("description").notNull(),
    reason: text("reason").notNull().default(""),
    referenceType: text("reference_type"),
    referenceId: text("reference_id"),
    referenceKey: text("reference_key").unique(),
    balanceBefore: cents("balance_before").notNull(),
    balanceAfter: cents("balance_after").notNull(),
  },
  (t) => [
    check("cash_movements_amount_non_negative", sql`${t.amount} >= 0`),
    check("cash_movements_sign_valid", sql`${t.sign} in (-1, 0, 1)`),
    index("ix_cash_movements_session_time").on(t.sessionId, t.occurredAt, t.id),
    index("ix_cash_movements_type_time").on(t.type, t.occurredAt),
  ],
);

/** Legacy: eventos_turno_caja (audit trail of open / close). */
export const cashEvents = pgTable(
  "cash_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull().references(() => cashSessions.id),
    type: cashEventType("type").notNull(),
    actorId: uuid("actor_id").notNull().references(() => users.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index("ix_cash_events_session_time").on(t.sessionId, t.occurredAt)],
);
