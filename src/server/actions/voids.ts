"use server";

import { revalidatePath } from "next/cache";
import { DomainError } from "@/shared/domain/errors";
import type { MovementLookupResult, TicketVoidInput, MovementLookupInput, MovementVoidInput } from "@/modules/reporting";
import type { ActionState } from "@/shared/ui";
import { requireUser } from "../auth";
import { ledgerUseCases, reportingUseCases } from "../composition";
import { PERMISSION_DENIED_MESSAGE, hasPermission } from "../permissions";
import { findMovementSchema, voidMovementSchema, voidTicketSchema } from "./void-schemas";

const UNEXPECTED = "Ocurrió un error inesperado. Intente nuevamente.";

/** Every screen that shows tickets, movements or cash figures changes when something is voided. */
function revalidateVoided() {
  for (const path of ["/", "/mis-tickets", "/movimientos", "/cierre-de-caja", "/mi-turno", "/nueva-venta", "/productos"]) revalidatePath(path);
}

/**
 * "Anular ticket completo" (legacy `anular_ticket`). A cashier needs `annul_own_sale` and the ledger only lets them
 * void tickets THEY sold; an admin (`annul_any_sale`) can void any ticket. A ticket of a closed cash session is
 * rejected by the ledger before any write.
 */
export async function voidTicketAction(input: TicketVoidInput): Promise<ActionState> {
  const parsed = voidTicketSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const user = await requireUser();
  if (!hasPermission(user, "annul_own_sale") && !hasPermission(user, "annul_any_sale")) return { ok: false, message: PERMISSION_DENIED_MESSAGE };
  try {
    await ledgerUseCases().voidTicket({ actor: { id: user.id, role: user.role }, ...parsed.data });
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, message: error.message };
    console.error(error);
    return { ok: false, message: UNEXPECTED };
  }
  revalidateVoided();
  return { ok: true, message: "Ticket anulado correctamente. El stock fue revertido." };
}

/** "Cargar movimiento" (legacy `get_movimiento_por_id`): admin lookup by the legacy numeric id. */
export async function findMovementAction(input: MovementLookupInput): Promise<MovementLookupResult> {
  const parsed = findMovementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const user = await requireUser();
  if (!hasPermission(user, "annul_any_movement")) return { ok: false, message: PERMISSION_DENIED_MESSAGE };
  try {
    const movement = await reportingUseCases().findMovementByNumber(parsed.data.number);
    if (!movement) return { ok: false, message: "No se encontró el movimiento." };
    return {
      ok: true,
      movement: {
        number: movement.number,
        businessDate: movement.businessDate,
        kind: movement.kind,
        description: movement.description,
        amount: movement.amount,
        voided: movement.voided,
        voidReason: movement.voidReason,
      },
    };
  } catch (error) {
    console.error(error);
    return { ok: false, message: UNEXPECTED };
  }
}

/** "Confirmar anulación administrativa" (legacy `anular_movimiento_por_id`); a movement of a closed session is rejected. */
export async function voidMovementAction(input: MovementVoidInput): Promise<ActionState> {
  const parsed = voidMovementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const user = await requireUser();
  if (!hasPermission(user, "annul_any_movement")) return { ok: false, message: PERMISSION_DENIED_MESSAGE };
  try {
    const movement = await reportingUseCases().findMovementByNumber(parsed.data.number);
    if (!movement) return { ok: false, message: "No se encontró el movimiento." };
    await ledgerUseCases().voidMovement({ actor: { id: user.id, role: user.role }, movementId: movement.id, reason: parsed.data.reason });
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, message: error.message };
    console.error(error);
    return { ok: false, message: UNEXPECTED };
  }
  revalidateVoided();
  return { ok: true, message: "Movimiento anulado correctamente." };
}
