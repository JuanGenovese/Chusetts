import { ProductsScreen } from "@/modules/catalog";
import { createProductAction } from "@/server/actions/home";
import {
  adjustProductStockAction,
  deactivateProductAction,
  removeRecipeComponentAction,
  restoreProductAction,
  saveRecipeComponentAction,
  updateProductAction,
} from "@/server/actions/products";
import { guardedPage } from "@/server/auth";
import { loadProductsData } from "@/server/queries/products";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return guardedPage("edit_products", async () => (
    <ProductsScreen
      data={await loadProductsData(await searchParams)}
      actions={{
        create: createProductAction,
        update: updateProductAction,
        deactivate: deactivateProductAction,
        restore: restoreProductAction,
        adjustStock: adjustProductStockAction,
        saveRecipeComponent: saveRecipeComponentAction,
        removeRecipeComponent: removeRecipeComponentAction,
      }}
    />
  ));
}
