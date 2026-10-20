import { DomainError } from "../errors";

/** Legacy ui/login.py copy, verbatim. The same message is used for every failure so usernames cannot be enumerated. */
export const LOGIN_ERROR_MESSAGE = "Usuario o contraseña incorrectos.";
export const NO_USERS_MESSAGE =
  "Todavía no existe ningún usuario. Creá el primer administrador con la herramienta local de esta PC.";

/** Legacy auth.MIN_PASSWORD_LENGTH. */
export const MIN_PASSWORD_LENGTH = 8;

/** Domain of the synthetic e-mails Supabase Auth needs. Never shown to users, never receives mail. */
export const AUTH_EMAIL_DOMAIN = "users.chusetts.local";

export type AppRole = "admin" | "cashier";

/** Legacy `authenticate`: `username.strip().lower()`. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

const SAFE_LOCAL_PART = /^[a-z0-9._-]+$/;
const ENCODED_PREFIX = "hex-";

/**
 * Supabase Auth is e-mail based: every username maps to a deterministic synthetic e-mail.
 * Usernames that are not valid e-mail local parts (spaces, accents, ...) are hex-encoded (UTF-8); plain usernames that
 * look like an encoded one are encoded too, so two different usernames can never share an e-mail.
 */
export function usernameToAuthEmail(username: string): string {
  const normalized = normalizeUsername(username);
  if (!normalized) throw new DomainError("INVALID_USERNAME", "El usuario no puede estar vacío.");
  const plain = SAFE_LOCAL_PART.test(normalized) && !normalized.startsWith(ENCODED_PREFIX);
  const local = plain ? normalized : ENCODED_PREFIX + Buffer.from(normalized, "utf8").toString("hex");
  return `${local}@${AUTH_EMAIL_DOMAIN}`;
}

/** Legacy `auth.validate_password`. */
export function validatePassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new DomainError("WEAK_PASSWORD", `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
}

/** Legacy roles are `admin` / `cajero`; the new model uses `admin` / `cashier`. */
export function legacyRoleToRole(legacyRole: string): AppRole {
  const role = legacyRole.trim().toLowerCase();
  if (role === "admin") return "admin";
  if (role === "cajero") return "cashier";
  throw new DomainError("INVALID_ROLE", "Rol inválido. Debe ser admin o cajero.");
}
