import { MovementsScreen } from "@/modules/reporting";
import { findMovementAction, voidMovementAction } from "@/server/actions/voids";
import { guardedPage } from "@/server/auth";
import { loadMovementsData } from "@/server/queries/history";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return guardedPage("view_all_movements", async () => (
    <MovementsScreen data={await loadMovementsData(await searchParams)} actions={{ find: findMovementAction, void: voidMovementAction }} />
  ));
}
