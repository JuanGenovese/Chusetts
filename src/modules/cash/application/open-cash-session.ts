import type { Cents } from "@/shared/domain/money";
import { CashSessionError, openSession as buildSession, type CashSession } from "../domain";
import type { CashDeps } from "./deps";
import { addEvent, recordMovement } from "./internal";

export interface OpenCashSessionInput {
  userId: string;
  openingCash: Cents;
  notes?: string;
  /** Defaults to the clock's business date. */
  businessDate?: string;
}

export const openCashSession = (deps: CashDeps) => (input: OpenCashSessionInput): Promise<CashSession> =>
  deps.uow.run(async (repos) => {
    if (await repos.sessions.findOpenByUser(input.userId)) {
      throw new CashSessionError("El usuario ya tiene una caja abierta.");
    }
    const notes = (input.notes ?? "").trim();
    const session = buildSession({
      id: deps.ids.next(),
      openedBy: input.userId,
      openingCash: input.openingCash,
      notes,
      businessDate: input.businessDate ?? deps.clock.businessDate(),
      now: deps.clock.now(),
    });
    await repos.sessions.insert(session);
    await recordMovement(repos, deps, {
      sessionId: session.id,
      actor: input.userId,
      type: "OPENING",
      amount: session.openingCash,
      sign: 1,
      description: "Efectivo inicial",
      reason: notes || "Apertura de caja",
      referenceType: "SESSION",
      referenceId: session.id,
      referenceKey: `OPENING:${session.id}`,
    });
    await addEvent(repos, deps, session.id, "OPENING", input.userId, {
      openingCash: session.openingCash,
      notes,
    });
    return session;
  });
