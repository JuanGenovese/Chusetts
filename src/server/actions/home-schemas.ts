import { z } from "zod";
import { parseDecimalInput } from "@/shared/domain/format";
import { parsePesosToCents } from "@/shared/domain/money";

/** Zod schemas of the home dialogs (raw strings from the forms -> typed values). Key order = validation order. */
const money = (label: string) =>
  z.string({ error: `${label}: dato inválido.` }).transform((value, ctx) => {
    const cents = parsePesosToCents(value);
    if (cents === null || cents < 0) {
      ctx.addIssue({ code: "custom", message: `${label}: ingrese un importe válido.` });
      return z.NEVER;
    }
    return cents;
  });

const quantity = (label: string) =>
  z.string({ error: `${label}: dato inválido.` }).transform((value, ctx) => {
    const parsed = parseDecimalInput(value);
    if (parsed === null || parsed < 0) {
      ctx.addIssue({ code: "custom", message: `${label}: ingrese un número válido.` });
      return z.NEVER;
    }
    return parsed;
  });

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha es inválida.");
const description = z.string({ error: "La descripción es obligatoria." }).trim().min(1, "La descripción es obligatoria.").max(500, "La descripción es demasiado larga.");
const text = (label: string) => z.string({ error: `${label}: dato inválido.` }).trim().min(1, `${label}: dato obligatorio.`);
const optionalId = z.string().trim().transform((v) => (v === "" ? null : v));

// Key order = validation order: the legacy checks the description first.
const expenseSchema = z.object({
  kind: z.literal("Gasto"),
  description,
  category: text("Categoría"),
  amount: money("Importe"),
  date,
  paymentMethod: text("Medio de pago"),
});

const purchaseSchema = z.object({
  kind: z.literal("Compra"),
  description,
  productId: optionalId,
  supplierId: optionalId,
  quantity: quantity("Cantidad"),
  unitCost: money("Costo unitario"),
  category: text("Categoría"),
  date,
  paymentMethod: text("Medio de pago"),
});

export const quickEntrySchema = z.discriminatedUnion("kind", [expenseSchema, purchaseSchema]);

export const productSchema = z.object({
  kind: z.enum(["Producto", "Insumo"]),
  name: z.string({ error: "El nombre del producto es obligatorio." }).trim().min(1, "El nombre del producto es obligatorio.").max(200, "El nombre es demasiado largo."),
  price: money("Precio de venta"),
  categoryId: z.string().trim(),
  sellable: z.boolean(),
  sku: z.string().trim().max(100, "El código interno es demasiado largo."),
  components: z
    .array(
      z.object({
        componentId: z.string().trim().min(1),
        quantity: z.string().regex(/^\d+$/, "Cantidad: ingrese un número entero."),
        unit: z.string().trim().min(1),
      }),
    )
    .max(20),
});

