import { z } from "zod";
import { parseDecimalInput } from "@/shared/domain/format";
import { parsePesosToCents } from "@/shared/domain/money";

/** Zod schemas of the /productos Server Actions (raw form strings -> typed values). Key order = validation order. */
const uuid = (message = "Dato inválido.") => z.guid(message);

const price = z.string({ error: "Precio de venta: dato inválido." }).transform((value, ctx) => {
  const cents = parsePesosToCents(value);
  if (cents === null || cents < 0) {
    ctx.addIssue({ code: "custom", message: "Precio de venta: ingrese un importe válido." });
    return z.NEVER;
  }
  return cents;
});

const decimal = (label: string, minimum: number, belowMinimumMessage?: string) =>
  z.string({ error: `${label}: dato inválido.` }).transform((value, ctx) => {
    const parsed = parseDecimalInput(value);
    if (parsed === null) {
      ctx.addIssue({ code: "custom", message: `${label}: ingrese un número válido.` });
      return z.NEVER;
    }
    if (parsed < minimum) {
      ctx.addIssue({ code: "custom", message: belowMinimumMessage ?? `${label}: ingrese un número válido.` });
      return z.NEVER;
    }
    return parsed;
  });

/** "Guardar ficha": only what the legacy form edits; the rest of the product is carried over by the action. */
export const updateProductSchema = z.object({
  id: uuid("Producto inválido."),
  name: z.string({ error: "El nombre es obligatorio." }).trim().min(1, "El nombre es obligatorio.").max(200, "El nombre es demasiado largo."),
  price,
  categoryId: uuid("La categoría seleccionada no existe o está inactiva."),
  sellable: z.boolean(),
  sku: z.string().trim().max(100, "El código interno es demasiado largo."),
});

/** "Desactivar producto" / "Restaurar producto". */
export const productIdSchema = z.object({ productId: uuid("Producto inválido.") });

/** "Registrar ajuste": counted physical stock (>= 0) and the mandatory reason. */
export const adjustStockSchema = z.object({
  productId: uuid("Producto inválido."),
  counted: decimal("Cantidad física contada", 0),
  reason: z.string({ error: "El motivo del ajuste es obligatorio." }).trim().min(1, "El motivo del ajuste es obligatorio.").max(500, "El motivo es demasiado largo."),
});

/** "Agregar o actualizar componente": the legacy number input has a 0.0001 minimum. */
export const saveRecipeComponentSchema = z.object({
  productId: uuid("Producto inválido."),
  componentId: uuid("El componente no existe o está inactivo."),
  quantity: decimal("Cantidad consumida", 0.0001, "La cantidad consumida debe ser mayor que cero."),
  unit: z.string({ error: "Unidad inválida." }).trim().min(1, "Unidad inválida."),
});

/** "Quitar de la receta". */
export const removeRecipeComponentSchema = z.object({
  productId: uuid("Producto inválido."),
  recipeId: uuid("Componente inválido."),
});
