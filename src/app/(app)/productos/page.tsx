import { guardedPage } from "@/server/auth";
import { PageHeader } from "@/shared/ui";

// TODO(phase-3): migrate this screen from the legacy app (ui/admin/products.py); only the header is rendered for now.
export default async function Page() {
  return guardedPage("edit_products", () => <PageHeader title="Productos e inventario" subtitle="Un catálogo claro para vender, comprar, controlar insumos y definir recetas." />);
}
