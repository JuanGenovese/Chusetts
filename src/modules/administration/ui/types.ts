import type { ActionState } from "@/shared/ui";
import type { AdminUserRow, PasswordEventRow } from "../domain";

/** A Server Action used as a form `action` (same shape as React's `useActionState` reducer). */
export type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export interface AdministrationData {
  users: AdminUserRow[];
  /** Newest first, already limited to the legacy 100. */
  events: PasswordEventRow[];
  /** Viewer holds `export_data`: only then the "Exportar datos" section is shown. */
  canExportData: boolean;
  /** Viewer is a developer: only then developer accounts are offered as password-reset targets. */
  canResetDevelopers: boolean;
}

export interface AdministrationActions {
  createUser: FormAction;
  resetPassword: FormAction;
}

/** Where the "Exportar datos" button downloads the JSON from. */
export const EXPORT_HREF = "/administracion/export";
