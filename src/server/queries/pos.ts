import type { PosData } from "@/modules/ledger";
import { requireUser } from "../auth";
import { cashUseCases, catalogUseCases, inventoryUseCases } from "../composition";

/** Data for "Nueva venta" (legacy `pos_sale_page`): the register check comes first, products only if it is open. */
export async function loadPosData(): Promise<PosData> {
  const user = await requireUser();
  const session = await cashUseCases().getOpenCashSession(user.id);
  if (!session) return { hasOpenCash: false, products: [], paymentMethods: [] };
  const catalog = catalogUseCases();
  const [products, paymentMethods] = await Promise.all([catalog.listProducts({ sellableOnly: true }), catalog.listPaymentMethods()]);
  const available = await inventoryUseCases().availableSaleQuantities(products.map((p) => p.id));
  return {
    hasOpenCash: true,
    products: products.map((p) => ({ id: p.id, name: p.name, category: p.categoryName, price: p.salePrice, available: available[p.id] ?? null })),
    paymentMethods: paymentMethods.map(({ id, name, code }) => ({ id, name, code: code ?? "" })),
  };
}
