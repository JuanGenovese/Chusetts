import type { CashPageData } from "@/modules/cash";
import { cashUseCases, currentUserProvider } from "../composition";

export async function loadCashPageData(): Promise<CashPageData> {
  const user = await currentUserProvider.getCurrentUser();
  const overview = await cashUseCases().getCashSessionOverview(user.id);
  return { user: { displayName: user.displayName, role: user.role }, overview };
}
