"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DomainError } from "@/shared/domain/errors";
import type { NewProductFormInput, NewProductResult } from "@/modules/catalog";
import type { QuickEntryInput } from "@/modules/ledger";
import type { CurrentUser } from "@/shared/application/current-user";
import type { ActionState } from "@/shared/ui";
import type { CheckOpenCashResult } from "@/modules/reporting";
import { requireUser } from "../auth";
import { catalogUseCases, ledgerUseCases, reportingUseCases } from "../composition";
import { productSchema, quickEntrySchema } from "./home-schemas";
import { PERMISSION_DENIED_MESSAGE, hasPermission, type Permission } from "../permissions";

function firstIssue(error: z.ZodError): ActionState {
  return { ok: false, message: error.issues[0]?.message ?? "Datos inválidos." };
}

async function guarded(user: CurrentUser, permission: Permission, failurePrefix: string, work: () => Promise<string>): Promise<ActionState> {
  if (!hasPermission(user, permission)) return { ok: false, message: PERMISSION_DENIED_MESSAGE };
  let message: string;
  try {
    message = await work();
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, message: `${failurePrefix}${error.message}` };
    console.error(error);
    return { ok: false, message: `${failurePrefix}ocurrió un error inesperado. Intente nuevamente.` };
  }
  for (const path of ["/", "/movimientos", "/cierre-de-caja", "/productos", "/mi-turno"]) revalidatePath(path);
  return { ok: true, message };
}

/** "Cargar gasto" / "Cargar compra" dialog (legacy `_guardar_movimiento`). */
export async function registerQuickEntryAction(input: QuickEntryInput): Promise<ActionState> {
  const parsed = quickEntrySchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const data = parsed.data;
  const user = await requireUser();
  const actor = { id: user.id, role: user.role };
  return guarded(user, data.kind === "Gasto" ? "create_expense" : "create_purchase", "", async () => {
    const ledger = ledgerUseCases();
    if (data.kind === "Gasto") {
      await ledger.registerExpense({
        actor,
        businessDate: data.date,
        description: data.description,
        category: data.category,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
      });
    } else {
      await ledger.registerPurchase({
        actor,
        businessDate: data.date,
        description: data.description,
        category: data.category,
        productId: data.productId,
        supplierId: data.supplierId,
        quantity: data.quantity,
        unitCost: data.unitCost,
        paymentMethod: data.paymentMethod,
      });
    }
    return "Movimiento guardado correctamente.";
  });
}

/** "Cargar producto" dialog (legacy `_guardar_nuevo_producto`): product/supply with an optional quick recipe. */
export async function createProductAction(input: NewProductFormInput): Promise<NewProductResult> {
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const data = parsed.data;
  const user = await requireUser();
  const isSupply = data.kind === "Insumo";
  // Legacy: a supply that is not marked "Se vende" is not sellable and its price is ignored.
  const isSellable = !(isSupply && !data.sellable);
  const recipe = isSupply
    ? []
    : data.components.map((c) => ({ componentId: c.componentId, quantity: Number(c.quantity), unit: c.unit })).filter((c) => c.quantity > 0);
  let productId: string | undefined;
  const result = await guarded(user, "edit_products", "No se pudo crear: ", async () => {
    const created = await catalogUseCases().createProduct({
      name: data.name,
      categoryId: data.categoryId || null,
      isSellable,
      controlsStock: true,
      salePrice: isSellable ? data.price : 0,
      unitCost: 0,
      initialStock: 0,
      minStock: 0,
      stockUnit: "unidad",
      sku: data.sku,
      isPurchasable: isSupply,
      isSupply,
      isCompound: recipe.length > 0,
      purchaseFactor: 1,
      supplierId: null,
      recipe,
      actorId: user.id,
    });
    productId = created.product.id;
    return "Producto creado correctamente.";
  });
  // The /productos screen opens the new product's detail page with the id.
  return result.ok ? { ...result, productId } : result;
}

/** Admin "Cerrar caja" quick action: is any cash session open? (the UI toasts or navigates). */
export async function checkOpenCashAction(): Promise<CheckOpenCashResult> {
  const user = await requireUser();
  if (!hasPermission(user, "admin_access")) return { ok: false, message: PERMISSION_DENIED_MESSAGE };
  return { ok: true, hasOpenSession: await reportingUseCases().hasAnyOpenCashSession() };
}
