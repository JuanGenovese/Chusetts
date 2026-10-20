import { guardedPage } from "@/server/auth";
import { PageHeader } from "@/shared/ui";

// TODO(phase-4): migrate this screen from the legacy app (ui/admin/movements.py); only the header is rendered for now.
export default async function Page() {
  return guardedPage("view_all_movements", () => <PageHeader title="Historial de movimientos" subtitle="Consulta detallada de todas las transacciones de caja y mercadería." />);
}
