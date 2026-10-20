"use server";

import { revalidatePath } from "next/cache";
import { DomainError } from "@/shared/domain/errors";
import type { ActionState } from "@/shared/ui";
import { requireUser } from "../auth";
import { administrationUseCases } from "../composition";
import { PERMISSION_DENIED_MESSAGE, hasPermission } from "../permissions";
import { createUserSchema, resetPasswordSchema } from "./admin-schemas";

const UNEXPECTED = "Ocurrió un error inesperado. Intente nuevamente.";
const CREATE_FAILED = "No se pudo crear el usuario: ";

const formObject = (formData: FormData) => Object.fromEntries(formData.entries());

/** "Crear usuario": admin only. Domain errors keep the legacy copy; the password repeat mismatch is shown bare. */
export async function createUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!hasPermission(user, "admin_access")) return { ok: false, message: PERMISSION_DENIED_MESSAGE };
  const parsed = createUserSchema.safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, message: `${CREATE_FAILED}${parsed.error.issues[0]?.message ?? "Datos inválidos."}` };
  try {
    await administrationUseCases().createUser(parsed.data);
  } catch (error) {
    if (error instanceof DomainError) {
      return { ok: false, message: error.code === "PASSWORD_MISMATCH" ? error.message : `${CREATE_FAILED}${error.message}` };
    }
    console.error(error);
    return { ok: false, message: `${CREATE_FAILED}${UNEXPECTED.charAt(0).toLowerCase()}${UNEXPECTED.slice(1)}` };
  }
  revalidatePath("/administracion");
  return { ok: true, message: `Usuario ${parsed.data.username.trim()} creado correctamente.` };
}

/** "Restablecer contraseña": admin only (checked here AND by the use case, which re-reads the actor's role). */
export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!hasPermission(user, "admin_access")) return { ok: false, message: PERMISSION_DENIED_MESSAGE };
  const parsed = resetPasswordSchema.safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  try {
    const { username } = await administrationUseCases().resetPassword({
      targetUsername: parsed.data.username,
      newPassword: parsed.data.newPassword,
      actorUsername: user.username,
    });
    revalidatePath("/administracion");
    return { ok: true, message: `Contraseña de ${username} restablecida correctamente.` };
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, message: error.message };
    console.error(error);
    return { ok: false, message: UNEXPECTED };
  }
}
