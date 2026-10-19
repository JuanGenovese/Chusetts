import { CashPage } from "@/modules/cash";
import { closeSessionAction, openSessionAction, recordMovementAction } from "@/server/actions/cash";
import { loadCashPageData } from "@/server/queries/cash";

// Reads the database on every request; never prerender at build time.
export const dynamic = "force-dynamic";

export default async function CajaPage() {
  const data = await loadCashPageData();
  return (
    <CashPage
      data={data}
      actions={{ open: openSessionAction, recordMovement: recordMovementAction, close: closeSessionAction }}
    />
  );
}
