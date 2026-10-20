import { z } from "zod";

/** Input of the POS "Confirmar venta" action: ids and quantities only (the server re-reads prices). */
export const saleSchema = z.object({
  lines: z
    .array(
      z.object({
        productId: z.string().trim().min(1, "Producto inválido."),
        quantity: z.number({ error: "Cantidad inválida." }).finite("Cantidad inválida.").positive("La cantidad vendida debe ser mayor que cero."),
      }),
    )
    .min(1, "El carrito está vacío.")
    .max(200, "El carrito tiene demasiados productos."),
  paymentMethod: z.string({ error: "Medio de pago inválido." }).trim().min(1, "Medio de pago inválido."),
  notes: z.string().trim().max(1000, "La observación es demasiado larga.").default(""),
});

export type SaleInput = z.input<typeof saleSchema>;
