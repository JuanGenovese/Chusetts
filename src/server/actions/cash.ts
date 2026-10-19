"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DomainError } from "@/shared/domain/errors";
import { parsePesosToCents } from "@/shared/domain/money";
import { MANUAL_MOVEMENT_SIGNS, type CashActionState, type ManualMovementType } from "@/modules/cash";
import { cashUseCases, currentUserProvider } from "../composition";

const centsField = (label: string) =>
  z
    .string({ error: `${label}: dato inválido.` })
    .transform((value, ctx) => {
      const cents = parsePesosToCents(value);
      if (cents === null) {
        ctx.addIssue({ code: "custom", message: `${label}: ingrese un importe válido.` });
        return z.NEVER;
      }
      return cents;
    });

const openSchema = z.object({
  openingCash: centsField("Efectivo inicial").refine((v) => v >= 0, "El efectivo inicial no puede ser negativo."),
  notes: z.string().trim().max(500, "Las observaciones son demasiado largas.").default(""),
});

const movementSchema = z.object({
  type: z.enum(Object.keys(MANUAL_MOVEMENT_SIGNS) as [ManualMovementType, ...ManualMovementType[]], {
    error: "Seleccione un tipo de movimiento válido.",
  }),
  amount: centsField("Monto").refine((v) => v > 0, "El monto debe ser mayor que cero."),
  reason: z.string().trim().min(1, "El motivo es obligatorio.").max(500, "El motivo es demasiado largo."),
});

const closeSchema = z.object({
  countedCash: centsField("Efectivo contado").refine((v) => v >= 0, "El efectivo contado no puede ser negativo."),
  notes: z.string().trim().max(500, "Las observaciones son demasiado largas.").default(""),
});

function fail(error: z.ZodError): CashActionState {
  return { ok: false, message: error.issues[0]?.message ?? "Datos inválidos." };
}

async function guarded(work: () => Promise<void>): Promise<CashActionState> {
  try {
    await work();
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, message: error.message };
    console.error(error);
    return { ok: false, message: "Ocurrió un error inesperado. Intente nuevamente." };
  }
  revalidatePath("/caja");
  return { ok: true, message: "Operación realizada correctamente." };
}

const formObject = (formData: FormData) => Object.fromEntries(formData.entries());

export async function openSessionAction(_prev: CashActionState, formData: FormData): Promise<CashActionState> {
  const parsed = openSchema.safeParse(formObject(formData));
  if (!parsed.success) return fail(parsed.error);
  const user = await currentUserProvider.getCurrentUser();
  return guarded(async () => {
    await cashUseCases().openCashSession({
      userId: user.id,
      openingCash: parsed.data.openingCash,
      notes: parsed.data.notes,
    });
  });
}

export async function recordMovementAction(_prev: CashActionState, formData: FormData): Promise<CashActionState> {
  const parsed = movementSchema.safeParse(formObject(formData));
  if (!parsed.success) return fail(parsed.error);
  const user = await currentUserProvider.getCurrentUser();
  return guarded(async () => {
    const useCases = cashUseCases();
    // The session is derived server-side from the user, never taken from the form.
    const session = await useCases.getOpenCashSession(user.id);
    if (!session) throw new DomainError("NO_OPEN_SESSION", "No hay una caja abierta.");
    await useCases.recordManualCashMovement({
      sessionId: session.id,
      actor: user.id,
      actorRole: user.role,
      ...parsed.data,
    });
  });
}

export async function closeSessionAction(_prev: CashActionState, formData: FormData): Promise<CashActionState> {
  const parsed = closeSchema.safeParse(formObject(formData));
  if (!parsed.success) return fail(parsed.error);
  const user = await currentUserProvider.getCurrentUser();
  return guarded(async () => {
    const useCases = cashUseCases();
    const session = await useCases.getOpenCashSession(user.id);
    if (!session) throw new DomainError("NO_OPEN_SESSION", "No hay una caja abierta.");
    await useCases.closeCashSession({
      sessionId: session.id,
      actor: user.id,
      countedCash: parsed.data.countedCash,
      notes: parsed.data.notes,
    });
  });
}
