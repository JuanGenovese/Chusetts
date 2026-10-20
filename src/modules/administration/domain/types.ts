import type { AppRole } from "@/shared/domain/auth/username";

/** A row of "Usuarios del sistema". */
export interface AdminUserRow {
  id: string;
  username: string;
  displayName: string;
  role: AppRole;
  isActive: boolean;
  createdAt: Date;
}

/** Legacy `eventos_password.tipo`. */
export type PasswordEventType = "CAMBIO_PROPIO" | "RESTABLECIMIENTO_ADMIN";

/** A row of the "Auditoría de cambios de contraseña" expander. */
export interface PasswordEventRow {
  username: string;
  type: PasswordEventType;
  performedBy: string;
  occurredAt: Date;
}

/** Legacy audit list: `ORDER BY id DESC LIMIT 100`. */
export const PASSWORD_EVENTS_LIMIT = 100;
