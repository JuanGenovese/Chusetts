import { guardedPage } from "@/server/auth";
import { PageHeader } from "@/shared/ui";

// TODO(phase-4): migrate this screen from the legacy app (ui/cashier/tickets.py); only the header is rendered for now.
export default async function Page() {
  return guardedPage("view_own_sales", () => <PageHeader title="Mis tickets" subtitle="Consulta de tickets propios y anulación completa del ticket con motivo." />);
}
