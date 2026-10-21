import { boolean, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["admin", "cashier", "developer"]);

/**
 * Application users: the source of truth for username, display name, role and the active flag.
 * `auth_user_id` links the row to Supabase Auth (`auth.users.id`, no cross-schema FK so the migration also runs on a
 * plain Postgres); the auth session only proves identity. Credentials live in Supabase Auth (the legacy bcrypt hashes are
 * imported there by `pnpm auth:provision-legacy`, never stored here).
 * Legacy: `users` (username, display_name, role in {admin, cajero}).
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  role: userRole("role").notNull().default("cashier"),
  isActive: boolean("is_active").notNull().default(true),
  authUserId: uuid("auth_user_id").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
