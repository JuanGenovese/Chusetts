import { resolveDateParam, resolveMovementFilters, type CashAdminData, type MovementsData, type MyTicketsData } from "@/modules/reporting";
import { requireUser } from "../auth";
import { reportingUseCases, todayBusinessDate } from "../composition";

type SearchParams = Record<string, string | string[] | undefined>;

/** Data for "Mis tickets": the user's own confirmed tickets of the selected day (`?fecha=`), with their lines. */
export async function loadMyTicketsData(searchParams: SearchParams): Promise<MyTicketsData> {
  const user = await requireUser();
  const reporting = reportingUseCases();
  const businessDate = resolveDateParam(searchParams.fecha, todayBusinessDate());
  const summaries = await reporting.listUserTickets({ userId: user.id, businessDate });
  const tickets = await Promise.all(
    summaries.map(async (t) => ({
      ticketId: t.ticketId,
      time: t.time,
      items: t.items,
      total: t.total,
      lines: await reporting.getTicketDetail({ ticketId: t.ticketId, userId: user.id }),
    })),
  );
  return { businessDate, tickets };
}

/** Data for "Historial de movimientos": the period / voided filters come from the URL. */
export async function loadMovementsData(searchParams: SearchParams): Promise<MovementsData> {
  const filters = resolveMovementFilters(searchParams, todayBusinessDate());
  return { filters, movements: await reportingUseCases().listMovements(filters) };
}

/** Data for the admin cash page ("Administración de caja"). */
export async function loadCashAdminData(): Promise<CashAdminData> {
  return { overview: await reportingUseCases().getCashAdminOverview() };
}
