import { createProductAction, checkOpenCashAction, registerQuickEntryAction } from "@/server/actions/home";
import { AdminHomeScreen, CashierHomeScreen } from "@/modules/reporting";
import { ProductForm } from "@/modules/catalog";
import { QuickEntryForm } from "@/modules/ledger";
import { requireUser } from "@/server/auth";
import { hasPermission, PERMISSION_DENIED_MESSAGE } from "@/server/permissions";
import { loadAdminDialogOptions, loadAdminHomeData, loadCashierHomeData } from "@/server/queries/home";
import { Alert } from "@/shared/ui";

/** "/" is the role's home, as in the legacy app: Caja for cashiers, Inicio for admins. */
export default async function HomePage() {
  const user = await requireUser();

  if (hasPermission(user, "admin_access")) {
    const { dashboard } = await loadAdminHomeData();
    const options = await loadAdminDialogOptions(dashboard.businessDate);
    return (
      <AdminHomeScreen
        dashboard={dashboard}
        actions={{ checkOpenCash: checkOpenCashAction }}
        dialogs={{
          expense: <QuickEntryForm kind="Gasto" options={options.expense} action={registerQuickEntryAction} />,
          purchase: <QuickEntryForm kind="Compra" options={options.purchase} action={registerQuickEntryAction} />,
          product: <ProductForm options={options.product} action={createProductAction} />,
        }}
      />
    );
  }
  if (hasPermission(user, "view_cashier_home")) {
    return <CashierHomeScreen data={await loadCashierHomeData()} />;
  }
  return <Alert tone="error">{PERMISSION_DENIED_MESSAGE}</Alert>;
}
