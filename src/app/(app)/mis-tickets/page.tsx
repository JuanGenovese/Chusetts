import { MyTicketsScreen } from "@/modules/reporting";
import { voidTicketAction } from "@/server/actions/voids";
import { guardedPage } from "@/server/auth";
import { loadMyTicketsData } from "@/server/queries/history";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return guardedPage("view_own_sales", async () => {
    const data = await loadMyTicketsData(await searchParams);
    // Keyed by date: navigating (sidebar link, date change) always starts from the server's state.
    return <MyTicketsScreen key={data.businessDate} data={data} action={voidTicketAction} />;
  });
}
