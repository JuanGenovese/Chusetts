import { index, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Legacy `eventos_password.tipo` CHECK values, kept verbatim: they are shown as-is in the audit table. */
export const passwordEventType = pgEnum("password_event_type", ["CAMBIO_PROPIO", "RESTABLECIMIENTO_ADMIN"]);

/**
 * Audit trail of password changes (legacy: eventos_password). Usernames are plain text, not foreign keys, so the trail
 * survives user renames or removal. Only the admin reset writes rows today (`RESTABLECIMIENTO_ADMIN`), exactly like the
 * legacy app. RLS is enabled with no policies (like every table in the remote project): only the server connection reads it.
 */
export const passwordEvents = pgTable(
  "password_events",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    username: text("username").notNull(),
    type: passwordEventType("type").notNull(),
    performedBy: text("performed_by").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ix_password_events_user").on(t.username, t.occurredAt)],
).enableRLS();
