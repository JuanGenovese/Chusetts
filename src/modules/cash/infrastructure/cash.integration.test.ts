import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDbConnection, type DbConnection } from "@/shared/infrastructure/db/client";
import { drizzleUnitOfWork } from "@/shared/infrastructure/db/unit-of-work";
import { cashEvents, cashMovements, cashSessions, users } from "@/shared/infrastructure/db/schema";
import {
  assertCashSessionAllowsVoid,
  closeCashSession,
  recordCashReversal,
  getCashBalance,
  getCashSessionOverview,
  listRecentCashSessions,
  openCashSession,
  recordCashSale,
  recordManualCashMovement,
  type CashDeps,
} from "../application";
import { createCashRepositories } from "./drizzle-cash-repositories";
import { SystemClock, UuidGenerator } from "./system-adapters";

const url = process.env.DATABASE_URL;
if (!url) {
  console.warn("[integration] DATABASE_URL is not set: skipping cash integration tests. Copy .env.local.example to .env.local, run `pnpm supabase:start && pnpm db:migrate`.");
}

describe.skipIf(!url)("cash module against Postgres", () => {
  let conn: DbConnection;
  let deps: CashDeps;
  const createdUsers: string[] = [];

  async function newUser(role: "admin" | "cashier" = "cashier") {
    const id = randomUUID();
    await conn.db.insert(users).values({ id, username: `it-${id}`, displayName: "Integration", role });
    createdUsers.push(id);
    return id;
  }

  beforeAll(() => {
    conn = createDbConnection(url!, { max: 5 });
    deps = {
      uow: drizzleUnitOfWork(conn.db, createCashRepositories),
      clock: new SystemClock(),
      ids: new UuidGenerator(),
    };
  });

  afterAll(async () => {
    if (createdUsers.length > 0) {
      const sessions = await conn.db.select({ id: cashSessions.id }).from(cashSessions).where(inArray(cashSessions.openedBy, createdUsers));
      const ids = sessions.map((s) => s.id);
      if (ids.length > 0) {
        await conn.db.delete(cashEvents).where(inArray(cashEvents.sessionId, ids));
        await conn.db.delete(cashMovements).where(inArray(cashMovements.sessionId, ids));
        await conn.db.delete(cashSessions).where(inArray(cashSessions.id, ids));
      }
      await conn.db.delete(users).where(inArray(users.id, createdUsers));
    }
    await conn.close();
  });

  it("opens a session, writes the ledger and exposes the overview", async () => {
    const userId = await newUser();
    const session = await openCashSession(deps)({ userId, openingCash: 5_000_000, notes: "turno" });
    expect(await getCashBalance(deps)(session.id)).toBe(5_000_000);
    const overview = await getCashSessionOverview(deps)(userId);
    expect(overview?.session.id).toBe(session.id);
    expect(overview?.movements.map((m) => m.type)).toEqual(["OPENING"]);
    expect(overview?.events.map((e) => e.type)).toEqual(["OPENING"]);
  });

  it("enforces one open session per user, even under concurrency", async () => {
    const userId = await newUser();
    const attempts = await Promise.allSettled([
      openCashSession(deps)({ userId, openingCash: 0 }),
      openCashSession(deps)({ userId, openingCash: 0 }),
    ]);
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.find((a) => a.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason.message).toBe("El usuario ya tiene una caja abierta.");
    const rows = await conn.db.select().from(cashSessions).where(eq(cashSessions.openedBy, userId));
    expect(rows).toHaveLength(1);
  });

  it("runs the full flow: sale hook, withdrawal, close with difference, closed sessions stay closed", async () => {
    const cashier = await newUser();
    const admin = await newUser("admin");
    const session = await openCashSession(deps)({ userId: cashier, openingCash: 5_000_000 });

    await recordCashSale(deps)({ sessionId: session.id, saleMovementId: "sale-1", actor: cashier, amount: 2_000_000, description: "T-1" });
    await recordManualCashMovement(deps)({
      sessionId: session.id, actor: admin, actorRole: "admin", type: "WITHDRAWAL", amount: 1_000_000, reason: "Retiro de seguridad",
    });
    expect(await getCashBalance(deps)(session.id)).toBe(6_000_000);

    const result = await closeCashSession(deps)({ sessionId: session.id, actor: cashier, countedCash: 5_950_000, notes: "Faltan 500" });
    expect(result).toMatchObject({ expectedCash: 6_000_000, difference: -50_000 });

    const [row] = await conn.db.select().from(cashSessions).where(eq(cashSessions.id, session.id));
    expect(row).toMatchObject({ status: "CLOSED", difference: -50_000, expectedCash: 6_000_000, countedCash: 5_950_000 });

    await expect(
      recordManualCashMovement(deps)({ sessionId: session.id, actor: admin, actorRole: "admin", type: "MANUAL_INCOME", amount: 1, reason: "x" }),
    ).rejects.toThrow("El movimiento debe registrarse en una caja abierta.");
    const events = await conn.db.select().from(cashEvents).where(eq(cashEvents.sessionId, session.id)).orderBy(cashEvents.occurredAt);
    expect(events.map((e) => e.type)).toEqual(["OPENING", "CLOSING"]);
  });

  it("rejects reversals and cash writes against a closed session and writes nothing", async () => {
    const userId = await newUser();
    const session = await openCashSession(deps)({ userId, openingCash: 10_000 });
    await recordCashSale(deps)({ sessionId: session.id, saleMovementId: `sale-${randomUUID()}`, actor: userId, amount: 1_000, description: "T-1" });
    await closeCashSession(deps)({ sessionId: session.id, actor: userId, countedCash: 11_000, notes: "" });
    const countBefore = (await conn.db.select().from(cashMovements).where(eq(cashMovements.sessionId, session.id))).length;

    const voidMessage = "No se puede anular: la caja de este ticket ya está cerrada. Registre un ajuste manual en la caja abierta.";
    await expect(
      recordCashReversal(deps)({
        originalMovementId: "any", sessionId: session.id, kind: "sale", paymentMethod: "cash", amount: 1_000, description: "T-1", actor: userId, reason: "Error",
      }),
    ).rejects.toThrow(voidMessage);
    await expect(assertCashSessionAllowsVoid(deps)(session.id)).rejects.toThrow(voidMessage);
    await expect(
      recordCashSale(deps)({ sessionId: session.id, saleMovementId: `sale-${randomUUID()}`, actor: userId, amount: 1, description: "x" }),
    ).rejects.toThrow("La caja está cerrada");

    const after = await conn.db.select().from(cashMovements).where(eq(cashMovements.sessionId, session.id));
    expect(after).toHaveLength(countBefore);
  });

  it("is idempotent per reference key and keeps the first movement intact", async () => {
    const userId = await newUser();
    const session = await openCashSession(deps)({ userId, openingCash: 0 });
    const input = { sessionId: session.id, saleMovementId: `sale-${randomUUID()}`, actor: userId, amount: 1_000, description: "T-1" };
    await recordCashSale(deps)(input);
    await expect(recordCashSale(deps)(input)).rejects.toThrow("Este movimiento ya impactó la caja.");
    expect(await getCashBalance(deps)(session.id)).toBe(1_000);
  });

  it("rolls back the whole unit of work when a step fails", async () => {
    const userId = await newUser();
    const id = randomUUID();
    await expect(
      deps.uow.run(async (repos) => {
        const now = new Date();
        await repos.sessions.insert({
          id, number: 0, businessDate: "2026-08-30", openedBy: userId, openedAt: now, openingCash: 0, status: "OPEN",
          closedBy: null, closedAt: null, expectedAmounts: null, countedAmounts: null, difference: null,
          openingNotes: "", closingNotes: "", updatedAt: now,
        });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const rows = await conn.db.select().from(cashSessions).where(eq(cashSessions.id, id));
    expect(rows).toHaveLength(0);
  });

  it("assigns increasing display numbers and lists recent sessions newest first", async () => {
    const userId = await newUser();
    const first = await openCashSession(deps)({ userId, openingCash: 100, notes: "" });
    await closeCashSession(deps)({ sessionId: first.id, actor: userId, countedCash: 100, notes: "" });
    const second = await openCashSession(deps)({ userId, openingCash: 200, notes: "" });
    const list = await listRecentCashSessions(deps)(userId, 20);
    expect(list.map((s) => s.id)).toEqual([second.id, first.id]);
    expect(list[0].number).toBeGreaterThan(list[1].number);
  });
});
