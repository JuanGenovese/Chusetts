import type { AdminHomeData, CashierHomeData } from "@/modules/reporting";
import type { ProductFormOptions } from "@/modules/catalog";
import type { QuickEntryOptions } from "@/modules/ledger";
import { requireUser } from "../auth";
import { cashUseCases, catalogUseCases, reportingUseCases } from "../composition";

export async function loadCashierHomeData(): Promise<CashierHomeData> {
  const user = await requireUser();
  const [home, session] = await Promise.all([
    reportingUseCases().getCashierHome({ userId: user.id }),
    cashUseCases().getOpenCashSession(user.id),
  ]);
  return { openSessionNumber: session?.number ?? null, home };
}

export async function loadAdminHomeData(): Promise<AdminHomeData> {
  return { dashboard: await reportingUseCases().getAdminDashboard() };
}

/** Everything the three admin dialogs need (legacy: read when the dialog opens). */
export async function loadAdminDialogOptions(businessDate: string): Promise<{
  expense: QuickEntryOptions;
  purchase: QuickEntryOptions;
  product: ProductFormOptions;
}> {
  const catalog = catalogUseCases();
  const [expenseCategories, purchaseCategories, paymentMethods, suppliers, products, categories, units] = await Promise.all([
    catalog.listMovementCategoryNames("Gasto"),
    catalog.listMovementCategoryNames("Compra"),
    catalog.listPaymentMethods(),
    catalog.listSuppliers(),
    catalog.listProducts(),
    catalog.listProductCategories(),
    catalog.listUnits(),
  ]);
  const payment = paymentMethods.map(({ id, name, code }) => ({ id, name, code }));
  return {
    expense: { businessDate, paymentMethods: payment, categories: expenseCategories, suppliers: [], products: [] },
    purchase: {
      businessDate,
      paymentMethods: payment,
      categories: purchaseCategories,
      suppliers: suppliers.map(({ id, name }) => ({ id, name })),
      products: products
        .filter((p) => p.isPurchasable)
        .map((p) => ({ id: p.id, name: p.name, unitCost: p.unitCost, purchaseFactor: p.purchaseFactor, stockUnit: p.stockUnit })),
    },
    product: {
      categories: categories.map(({ id, name }) => ({ id, name })),
      supplies: products.filter((p) => p.isSupply).map(({ id, name }) => ({ id, name })),
      units: units.map(({ id, code }) => ({ id, code: code ?? "" })),
    },
  };
}
