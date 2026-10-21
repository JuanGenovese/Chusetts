import type { AdministrationData } from "@/modules/administration";
import type { AppRole } from "@/shared/domain/auth/username";
import { administrationUseCases } from "../composition";
import { hasPermission } from "../permissions";

/** Data for "Administración": every user (ordered by username) and the last 100 password events. */
export async function loadAdministrationData(viewer: { role: AppRole }): Promise<AdministrationData> {
  const administration = administrationUseCases();
  const [users, events] = await Promise.all([administration.listUsers(), administration.listPasswordEvents()]);
  return { users, events, canExportData: hasPermission(viewer, "export_data"), canResetDevelopers: viewer.role === "developer" };
}
