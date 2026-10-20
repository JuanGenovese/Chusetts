import { eq, sql } from "drizzle-orm";
import type { AppUserRecord, UserDirectory } from "../../application/auth/ports";
import type { DbExecutor } from "../db/client";
import { users } from "../db/schema";

const toRecord = (row: typeof users.$inferSelect): AppUserRecord => ({
  id: row.id,
  username: row.username,
  displayName: row.displayName,
  role: row.role,
  isActive: row.isActive,
  authUserId: row.authUserId,
});

export class DrizzleUserDirectory implements UserDirectory {
  constructor(private readonly db: DbExecutor) {}

  async findByUsername(username: string) {
    const [row] = await this.db.select().from(users).where(eq(users.username, username)).limit(1);
    return row ? toRecord(row) : null;
  }

  async findByAuthUserId(authUserId: string) {
    const [row] = await this.db.select().from(users).where(eq(users.authUserId, authUserId)).limit(1);
    return row ? toRecord(row) : null;
  }

  async countUsers() {
    const [row] = await this.db.select({ n: sql<number>`count(*)::int` }).from(users);
    return row?.n ?? 0;
  }
}
