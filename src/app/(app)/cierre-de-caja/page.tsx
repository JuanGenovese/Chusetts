import { guardedPage } from "@/server/auth";
import { PageHeader } from "@/shared/ui";

// TODO(phase-4): migrate this screen from the legacy app (ui/cashier/shift.py _admin_cash_page); only the header is rendered for now.
export default async function Page() {
  return guardedPage("close_cash", () => <PageHeader title="Administración de caja" subtitle="Supervisión de cajas, efectivo, movimientos autorizados y auditoría." />);
}
