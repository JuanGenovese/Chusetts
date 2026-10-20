import type { AdministrationData } from "@/modules/administration";
import { administrationUseCases } from "../composition";

/** Data for "Administración": every user (ordered by username) and the last 100 password events. */
export async function loadAdministrationData(): Promise<AdministrationData> {
  const administration = administrationUseCases();
  const [users, events] = await Promise.all([administration.listUsers(), administration.listPasswordEvents()]);
  return { users, events };
}
