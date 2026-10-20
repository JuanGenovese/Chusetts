import { z } from "zod";

const movementNumber = z
  .number({ error: "Ingrese un número de movimiento válido." })
  .int("Ingrese un número de movimiento válido.")
  .min(1, "Ingrese un número de movimiento válido.");

/** "Anular ticket completo" (Mis tickets): the ticket id and the mandatory reason. */
export const voidTicketSchema = z.object({
  ticketId: z.string({ error: "Ticket inválido." }).trim().min(1, "Ticket inválido."),
  reason: z.string({ error: "El motivo es obligatorio." }).trim().min(1, "El motivo es obligatorio.").max(1000, "El motivo es demasiado largo."),
});

/** "Cargar movimiento" (Movimientos): the legacy numeric id of the ledger row. */
export const findMovementSchema = z.object({ number: movementNumber });

/** "Confirmar anulación administrativa". */
export const voidMovementSchema = z.object({
  number: movementNumber,
  reason: z
    .string({ error: "El motivo de anulación es obligatorio." })
    .trim()
    .min(1, "El motivo de anulación es obligatorio.")
    .max(1000, "El motivo es demasiado largo."),
});
