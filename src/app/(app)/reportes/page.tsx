import { guardedPage } from "@/server/auth";
import { PageHeader } from "@/shared/ui";

// TODO(phase-5): migrate this screen from the legacy app (ui/admin/reports.py); only the header is rendered for now.
export default async function Page() {
  return guardedPage("view_reports", () => <PageHeader title="Reportes" subtitle="Exportaciones y consultas generales." />);
}
