import { z } from "zod";

const INVALID = "Datos inválidos.";
// Generous bounds, only to keep absurd payloads out; the legacy rules (8+ characters, role names) live in the domain.
const text = (max: number) => z.string({ error: INVALID }).max(max, INVALID);

/** "Crear usuario": raw form values. Passwords are never trimmed; the domain normalizes username / display name. */
export const createUserSchema = z.object({
  username: text(100),
  displayName: text(100).default(""),
  role: z.enum(["cajero", "admin"], { error: "Rol inválido. Debe ser admin o cajero." }),
  password: text(200),
  passwordRepeat: text(200),
});

/** "Restablecer contraseña": the selected username and the temporary password typed twice. */
export const resetPasswordSchema = z
  .object({
    username: z.string({ error: "El usuario seleccionado no existe." }).min(1, "El usuario seleccionado no existe.").max(100, INVALID),
    newPassword: text(200),
    newPasswordRepeat: text(200),
  })
  .refine((v) => v.newPassword === v.newPasswordRepeat, { message: "Las contraseñas no coinciden.", path: ["newPasswordRepeat"] });
