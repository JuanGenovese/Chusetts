import type { Cents } from "@/shared/domain/money";
import { CashSessionError, closeSession as closeDomain, type CloseResult } from "../domain";
import type { CashDeps } from "./deps";
import { addEvent, expectedFor, recordMovement, requireSession } from "./internal";

export interface CloseCashSessionInput {
  sessionId: string;
  actor: string;
  countedCash: Cents;
  notes?: string;
}

export const closeCashSession = (deps: CashDeps) => (input: CloseCashSessionInput): Promise<CloseResult> =>
  deps.uow.run(async (repos) => {
    const session = await requireSession(repos, input.sessionId, true);
    const expected = await expectedFor(repos, session.id);
    const notes = (input.notes ?? "").trim();
    const { session: closed, result } = closeDomain(session, {
      actor: input.actor,
      countedCash: input.countedCash,
      notes,
      expected,
      now: deps.clock.now(),
    });
    if (!(await repos.sessions.update(closed, "OPEN"))) {
      throw new CashSessionError("La caja cambió mientras intentabas cerrarla.");
    }
    await recordMovement(repos, deps, {
      sessionId: session.id,
      actor: input.actor,
      type: "CLOSING",
      amount: result.countedCash,
      sign: 0,
      description: "Cierre de caja",
      reason: notes || "Cierre operativo",
      referenceType: "SESSION",
      referenceId: session.id,
    });
    await addEvent(repos, deps, session.id, "CLOSING", input.actor, { ...result, notes });
    return result;
  });
