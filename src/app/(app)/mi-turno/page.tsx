import { ShiftScreen } from "@/modules/cash";
import { closeSessionAction, openSessionAction } from "@/server/actions/cash";
import { guardedPage } from "@/server/auth";
import { loadShiftPageData } from "@/server/queries/cash";

export default async function MiTurnoPage() {
  return guardedPage("manage_own_shift", async () => {
    const data = await loadShiftPageData();
    return <ShiftScreen data={data} actions={{ open: openSessionAction, close: closeSessionAction }} />;
  });
}
