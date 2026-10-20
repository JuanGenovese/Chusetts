import { guardedPage } from "@/server/auth";
import { PageHeader } from "@/shared/ui";

// TODO(phase-2): migrate this screen from the legacy app (ui/admin/settings.py); only the header is rendered for now.
export default async function Page() {
  return guardedPage("admin_access", () => <PageHeader title="Administración" subtitle="Datos maestros, usuarios y configuración general del sistema." />);
}
