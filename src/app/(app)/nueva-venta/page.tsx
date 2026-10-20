import { PosScreen } from "@/modules/ledger";
import { registerSaleAction } from "@/server/actions/sale";
import { guardedPage } from "@/server/auth";
import { loadPosData } from "@/server/queries/pos";

export default async function Page() {
  return guardedPage("create_sale", async () => <PosScreen data={await loadPosData()} action={registerSaleAction} />);
}
