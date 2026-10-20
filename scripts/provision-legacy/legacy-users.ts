import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { LegacyAuthUser } from "../../src/shared/domain/auth/provisioning-plan";

/** Reads `users` (username, password_hash, display_name, role, is_active) from the legacy SQLite, strictly read-only. */
export function readLegacyAuthUsers(path: string): LegacyAuthUser[] {
  if (!existsSync(path)) throw new Error(`Legacy database not found: ${path}`);
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const columns = new Set(db.prepare("pragma table_info(users)").all().map((c) => String(c.name)));
    for (const needed of ["username", "password_hash", "display_name", "role", "is_active"]) {
      if (!columns.has(needed)) throw new Error(`Legacy table users has no column "${needed}".`);
    }
    return db
      .prepare("select username, password_hash, display_name, role, is_active from users order by id")
      .all()
      .map((row) => ({
        username: String(row.username),
        displayName: String(row.display_name ?? ""),
        role: String(row.role),
        active: Number(row.is_active) === 1,
        passwordHash: String(row.password_hash ?? ""),
      }));
  } finally {
    db.close();
  }
}
