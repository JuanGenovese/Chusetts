import { CashSessionError } from "../../domain";
import type { CashEvent, CashMovement, CashSession, PaymentTotal, SalesSummary } from "../../domain";
import type { CashRepositories, CashUnitOfWork } from "../ports/repositories";
import type { Clock, IdGenerator } from "../ports/runtime";

/** In-memory fakes for unit tests. The UoW snapshots state and restores it when the work throws. */
export class InMemoryCashStore {
  sessions = new Map<string, CashSession>();
  movements: CashMovement[] = [];
  events: CashEvent[] = [];
  nonCashTotals = new Map<string, PaymentTotal[]>();
  salesSummaries = new Map<string, SalesSummary>();

  snapshot() {
    return structuredClone({ sessions: this.sessions, movements: this.movements, events: this.events });
  }

  restore(s: ReturnType<InMemoryCashStore["snapshot"]>) {
    this.sessions = s.sessions;
    this.movements = s.movements;
    this.events = s.events;
  }

  repositories(): CashRepositories {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- fakes close over the store
    const store = this;
    return {
      sessions: {
        async findById(id) {
          return structuredClone(store.sessions.get(id) ?? null);
        },
        async findOpenByUser(userId) {
          const found = [...store.sessions.values()].find((s) => s.openedBy === userId && s.status === "OPEN");
          return structuredClone(found ?? null);
        },
        async insert(session) {
          const dup = [...store.sessions.values()].some((s) => s.openedBy === session.openedBy && s.status === "OPEN");
          if (dup) throw new CashSessionError("El usuario ya tiene una caja abierta.");
          store.sessions.set(session.id, { ...structuredClone(session), number: store.sessions.size + 1 });
        },
        async listRecentByUser(userId, limit) {
          return structuredClone(
            [...store.sessions.values()]
              .filter((s) => s.openedBy === userId)
              .sort((a, b) => b.number - a.number)
              .slice(0, limit),
          );
        },
        async update(session, expectedStatus) {
          const current = store.sessions.get(session.id);
          if (!current || current.status !== expectedStatus) return false;
          store.sessions.set(session.id, structuredClone(session));
          return true;
        },
      },
      movements: {
        async balance(sessionId) {
          return store.movements.filter((m) => m.sessionId === sessionId).reduce((a, m) => a + m.sign * m.amount, 0);
        },
        async existsByReferenceKey(key) {
          return store.movements.some((m) => m.referenceKey === key);
        },
        async insert(movement) {
          if (movement.referenceKey && store.movements.some((m) => m.referenceKey === movement.referenceKey)) {
            throw new CashSessionError("Este movimiento ya impactó la caja.");
          }
          store.movements.push(structuredClone(movement));
        },
        async listBySession(sessionId) {
          return structuredClone(store.movements.filter((m) => m.sessionId === sessionId));
        },
      },
      events: {
        async insert(event) {
          store.events.push(structuredClone(event));
        },
        async listBySession(sessionId) {
          return structuredClone(store.events.filter((e) => e.sessionId === sessionId));
        },
      },
      ledger: {
        async nonCashTotals(sessionId) {
          return store.nonCashTotals.get(sessionId) ?? [];
        },
        async salesSummary(sessionId) {
          return store.salesSummaries.get(sessionId) ?? { sales: 0, cashSales: 0, electronicSales: 0, tickets: 0 };
        },
      },
    };
  }

  unitOfWork(): CashUnitOfWork {
    return {
      run: async (work) => {
        const before = this.snapshot();
        try {
          return await work(this.repositories());
        } catch (error) {
          this.restore(before);
          throw error;
        }
      },
    };
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

export class SequentialIds implements IdGenerator {
  private n = 0;
  next() {
    this.n += 1;
    return `id-${this.n}`;
  }
}

export function makeTestDeps() {
  const store = new InMemoryCashStore();
  return { store, deps: { uow: store.unitOfWork(), clock: new FixedClock(), ids: new SequentialIds() } };
}
