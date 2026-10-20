"use server";

import { revalidatePath } from "next/cache";
import { DomainError } from "@/shared/domain/errors";
import type { SaleActionInput } from "@/modules/ledger";
import type { ActionState } from "@/shared/ui";
import { requireUser } from "../auth";
import { ledgerUseCases } from "../composition";
import { PERMISSION_DENIED_MESSAGE, hasPermission } from "../permissions";
import { saleSchema } from "./sale-schema";

/** POS "Confirmar venta" (legacy `save_ticket`): one atomic ticket (ledger + stock + cash). */
export async function registerSaleAction(input: SaleActionInput): Promise<ActionState> {
  const user = await requireUser();
  if (!hasPermission(user, "create_sale")) return { ok: false, message: PERMISSION_DENIED_MESSAGE };
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { lines, paymentMethod, notes } = parsed.data;
  let ticketId: string;
  try {
    ({ ticketId } = await ledgerUseCases().registerSaleTicket({ actor: { id: user.id, role: user.role }, lines, paymentMethod, notes }));
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, message: error.message };
    console.error(error);
    return { ok: false, message: "Ocurrió un error inesperado. Intente nuevamente." };
  }
  for (const path of ["/", "/nueva-venta", "/mis-tickets", "/mi-turno", "/movimientos", "/cierre-de-caja", "/productos"]) revalidatePath(path);
  return { ok: true, message: `Venta confirmada. Ticket: ${ticketId}` };
}
