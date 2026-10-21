import { DomainError } from "@/shared/domain/errors";
import { isAdminLike } from "@/shared/domain/auth/permissions";
import { legacyRoleToRole, normalizeUsername, usernameToAuthEmail, validatePassword, type AppRole } from "@/shared/domain/auth/username";

export const PASSWORD_MISMATCH_MESSAGE = "Las contraseñas no coinciden.";
export const RESET_FORBIDDEN_MESSAGE = "Solo un administrador activo puede restablecer contraseñas.";
export const RESET_DEVELOPER_FORBIDDEN_MESSAGE = "No podés restablecer la contraseña de una cuenta de desarrollador.";
export const RESET_TARGET_MISSING_MESSAGE = "El usuario seleccionado no existe.";

export interface NewUserInput {
  username: string;
  displayName: string;
  /** Legacy role name: "cajero" or "admin". */
  role: string;
  password: string;
  passwordRepeat: string;
}

export interface NewUser {
  username: string;
  displayName: string;
  role: AppRole;
  authEmail: string;
  password: string;
}

/**
 * Legacy "Crear usuario" submit + `auth.create_user`: the repeat check comes first (the form), then username / display
 * name normalization, role and password length. Throws a `DomainError` whose message is the legacy copy.
 */
export function prepareNewUser(input: NewUserInput): NewUser {
  if (input.password !== input.passwordRepeat) throw new DomainError("PASSWORD_MISMATCH", PASSWORD_MISMATCH_MESSAGE);
  const username = normalizeUsername(input.username);
  if (!username) throw new DomainError("INVALID_USERNAME", "El nombre de usuario es obligatorio.");
  const displayName = input.displayName.trim() || username;
  const role = legacyRoleToRole(input.role);
  validatePassword(input.password);
  return { username, displayName, role, authEmail: usernameToAuthEmail(username), password: input.password };
}

/** Legacy `reset_user_password`: only an ACTIVE admin (or developer) may reset passwords. */
export function assertCanResetPasswords(actor: { role: AppRole; isActive: boolean } | null): asserts actor is { role: AppRole; isActive: true } {
  if (!actor || !actor.isActive || !isAdminLike(actor.role)) throw new DomainError("FORBIDDEN", RESET_FORBIDDEN_MESSAGE);
}

/** Anti-escalation: only a developer may reset a developer's password. */
export function assertCanResetPasswordOf(actorRole: AppRole, targetRole: AppRole): void {
  if (targetRole === "developer" && actorRole !== "developer") throw new DomainError("FORBIDDEN", RESET_DEVELOPER_FORBIDDEN_MESSAGE);
}

/** The legacy role name shown in the users table. */
export function roleLabel(role: AppRole): string {
  if (role === "developer") return "dev";
  return role === "admin" ? "admin" : "cajero";
}
