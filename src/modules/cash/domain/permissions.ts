import { PermissionDeniedError } from "./errors";
import type { UserRole } from "./types";

export function assertCanRecordManualMovement(role: UserRole | string): void {
  if (role !== "admin" && role !== "developer") {
    throw new PermissionDeniedError("Solo ADMIN puede registrar movimientos manuales de caja.");
  }
}
