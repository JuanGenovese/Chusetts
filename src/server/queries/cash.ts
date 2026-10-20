import type { ShiftPageData } from "@/modules/cash";
import { requireUser } from "../auth";
import { cashUseCases } from "../composition";

/** Data for "Mi turno": the user's open session (with figures) and their latest sessions. */
export async function loadShiftPageData(): Promise<ShiftPageData> {
  const user = await requireUser();
  const useCases = cashUseCases();
  const [overview, recentSessions] = await Promise.all([
    useCases.getCashSessionOverview(user.id),
    useCases.listRecentCashSessions(user.id, 20),
  ]);
  return { overview, recentSessions };
}
