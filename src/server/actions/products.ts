"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { CatalogError, productUpdateFromEdits, type UpdateProductFormInput } from "@/modules/catalog";
import { DomainError } from "@/shared/domain/errors";
import type { CurrentUser } from "@/shared/application/current-user";
import type { ActionState } from "@/shared/ui";
import { requireUser } from "../auth";
import { catalogUseCases, inventoryUseCases, ledgerUseCases } from "../composition";
import { PERMISSION_DENIED_MESSAGE, hasPermission, type Permission } from "../permissions";
import { adjustStockSchema, productIdSchema, removeRecipeComponentSchema, saveRecipeComponentSchema, updateProductSchema } from "./product-schemas";

const SAVE_FAILED = "No se pudo guardar: ";
const REMOVE_FAILED = "Error al quitar componente: ";
const UNEXPECTED = "Ocurrió un error inesperado. Intente nuevamente.";

/** Legacy error texts: what a domain error is shown after, and what any other exception is shown after. */
interface FailurePrefixes {
  domain: string;
  other: string;
}
const unexpectedMessage = (prefix: string) => (prefix ? `${prefix}${UNEXPECTED.charAt(0).toLowerCase()}${UNEXPECTED.slice(1)}` : UNEXPECTED);

/** Every screen that lists or sells products changes when the catalog, a recipe or the stock changes. */
function revalidateCatalog() {
  for (const path of ["/", "/productos", "/nueva-venta", "/movimientos", "/reportes"]) revalidatePath(path);
}

function firstIssue(error: z.ZodError, prefix: string): ActionState {
  return { ok: false, message: `${prefix}${error.issues[0]?.message ?? "Datos inválidos."}` };
}

/**
 * Runs one /productos mutation: permission first (enforced here, never only in the UI), then the work. Domain errors
 * keep their legacy message; anything else is logged and reported generically.
 */
async function guarded(
  user: CurrentUser,
  permissions: Permission[],
  prefixes: FailurePrefixes,
  work: () => Promise<string>,
): Promise<ActionState> {
  if (!permissions.every((permission) => hasPermission(user, permission))) return { ok: false, message: PERMISSION_DENIED_MESSAGE };
  let message: string;
  try {
    message = await work();
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, message: `${prefixes.domain}${error.message}` };
    console.error(error);
    return { ok: false, message: unexpectedMessage(prefixes.other) };
  }
  revalidateCatalog();
  return { ok: true, message };
}

/** "Guardar ficha" (legacy `_render_edit_form`): edits name / category / price / "Se vende" / code, keeps the rest. */
export async function updateProductAction(input: UpdateProductFormInput): Promise<ActionState> {
  const parsed = updateProductSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error, "No se pudo guardar: ");
  const data = parsed.data;
  const user = await requireUser();
  return guarded(user, ["edit_products"], { domain: SAVE_FAILED, other: SAVE_FAILED }, async () => {
    const catalog = catalogUseCases();
    const product = await catalog.getProduct(data.id);
    if (!product) throw new CatalogError("El producto no existe.");
    await catalog.updateProduct(productUpdateFromEdits(product, data, user.id));
    return "Ficha actualizada.";
  });
}

/** "Desactivar producto": hides it from the catalog and the POS without deleting its history. */
export async function deactivateProductAction(input: { productId: string }): Promise<ActionState> {
  const parsed = productIdSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error, "");
  const user = await requireUser();
  return guarded(user, ["edit_products"], { domain: "", other: "" }, async () => {
    await catalogUseCases().deactivateProduct({ id: parsed.data.productId, actorId: user.id });
    return "Producto desactivado.";
  });
}

export async function restoreProductAction(input: { productId: string }): Promise<ActionState> {
  const parsed = productIdSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error, "");
  const user = await requireUser();
  return guarded(user, ["edit_products"], { domain: "", other: "" }, async () => {
    await catalogUseCases().restoreProduct({ id: parsed.data.productId, actorId: user.id });
    return "Producto restaurado.";
  });
}

/** "Registrar ajuste" (Inventario tab): audited stock count; admin only (`adjust_stock`). */
export async function adjustProductStockAction(input: { productId: string; counted: string; reason: string }): Promise<ActionState> {
  const parsed = adjustStockSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error, "");
  const data = parsed.data;
  const user = await requireUser();
  return guarded(user, ["edit_products", "adjust_stock"], { domain: "", other: "Error al registrar ajuste: " }, async () => {
    await ledgerUseCases().adjustStock({ actor: { id: user.id, role: user.role }, productId: data.productId, countedStock: data.counted, reason: data.reason });
    return "Stock ajustado y auditado.";
  });
}

/** "Agregar o actualizar componente" (Receta tab). */
export async function saveRecipeComponentAction(input: { productId: string; componentId: string; quantity: string; unit: string }): Promise<ActionState> {
  const parsed = saveRecipeComponentSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error, "");
  const data = parsed.data;
  const user = await requireUser();
  return guarded(user, ["edit_products"], { domain: "", other: "Error al actualizar componente: " }, async () => {
    await inventoryUseCases().setRecipeComponent({
      saleProductId: data.productId,
      componentId: data.componentId,
      quantity: data.quantity,
      unit: data.unit,
      actorId: user.id,
    });
    return "Receta actualizada.";
  });
}

/** "Quitar de la receta". */
export async function removeRecipeComponentAction(input: { productId: string; recipeId: string }): Promise<ActionState> {
  const parsed = removeRecipeComponentSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error, "Error al quitar componente: ");
  const user = await requireUser();
  return guarded(user, ["edit_products"], { domain: REMOVE_FAILED, other: REMOVE_FAILED }, async () => {
    await inventoryUseCases().removeRecipeComponent({ saleProductId: parsed.data.productId, recipeId: parsed.data.recipeId });
    return "Componente eliminado.";
  });
}
