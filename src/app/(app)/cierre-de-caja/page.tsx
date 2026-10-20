import { CashAdminScreen } from "@/modules/reporting";
import { recordMovementAction } from "@/server/actions/cash";
import { guardedPage } from "@/server/auth";
import { loadCashAdminData } from "@/server/queries/history";

export default async function Page() {
  return guardedPage("close_cash", async () => <CashAdminScreen data={await loadCashAdminData()} actions={{ recordMovement: recordMovementAction }} />);
}
