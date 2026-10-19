import { boolean, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["admin", "cashier"]);

/**
 * Minimal users table (Phase 1). In Phase 2 this is linked to Supabase Auth
 * (`auth.users.id`) and extended with whatever profile data is needed.
 * Legacy: `users` (username, display_name, role in {admin, cajero}); password hashes are NOT ported
 * because Supabase Auth owns credentials.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  role: userRole("role").notNull().default("cashier"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
