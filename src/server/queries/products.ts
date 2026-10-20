import type { CatalogEntry, Product, ProductDetailData, ProductsData, ProductFormOptions } from "@/modules/catalog";
import { compatibleUnits } from "@/modules/inventory";
import { formatTimestamp } from "@/shared/domain/datetime";
import { catalogUseCases, inventoryUseCases, reportingUseCases } from "../composition";

type SearchParams = Record<string, string | string[] | undefined>;

/** Loose uuid shape: ids come from the URL, and Postgres rejects anything else with an error. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const toEntry = (product: Product, stock: Map<string, number>): CatalogEntry => ({
  id: product.id,
  name: product.name,
  sku: product.sku,
  categoryName: product.categoryName,
  salePrice: product.salePrice,
  active: product.active,
  isSellable: product.isSellable,
  isSupply: product.isSupply,
  controlsStock: product.controlsStock,
  stock: stock.get(product.id) ?? 0,
  minStock: product.minStock,
  stockUnit: product.stockUnit,
});

async function loadDetail(id: string, all: Product[], stock: Map<string, number>, categories: { id: string; name: string }[]): Promise<ProductDetailData | null> {
  const product = all.find((p) => p.id === id);
  if (!product) return null;
  const [recipe, history] = await Promise.all([
    inventoryUseCases().getRecipe(id),
    reportingUseCases().listProductStockHistory({ productId: id }),
  ]);
  return {
    product: {
      id: product.id,
      name: product.name,
      sku: product.sku,
      categoryId: product.categoryId,
      categoryName: product.categoryName,
      salePrice: product.salePrice,
      active: product.active,
      isSellable: product.isSellable,
      isSupply: product.isSupply,
      controlsStock: product.controlsStock,
      stock: stock.get(product.id) ?? 0,
      stockUnit: product.stockUnit,
    },
    categories,
    recipe: recipe.map((line) => ({
      id: line.id,
      componentName: line.componentName,
      quantity: line.quantity,
      unit: line.unit,
      stockQuantity: line.stockQuantity,
      stockUnit: line.stockUnit,
    })),
    // Legacy: active, stock-controlled products other than this one (`get_productos()` order).
    recipeComponents: all
      .filter((p) => p.active && p.id !== id && p.controlsStock)
      .map((p) => ({ id: p.id, name: p.name, stockUnit: p.stockUnit, units: compatibleUnits(p.stockUnit) })),
    history: history.map((row) => ({
      id: row.id,
      type: row.type,
      at: formatTimestamp(row.createdAt),
      actor: row.actorUsername,
      delta: row.quantityDelta,
      before: row.stockBefore,
      after: row.stockAfter,
      reason: row.reason,
    })),
  };
}

/** Data for "Productos e inventario": the catalog, the "Nuevo producto" dialog options and, with `?producto=`, a detail page. */
export async function loadProductsData(searchParams: SearchParams): Promise<ProductsData> {
  const catalog = catalogUseCases();
  const [products, categories, units, levels] = await Promise.all([
    catalog.listProducts({ includeInactive: true }),
    catalog.listProductCategories(),
    catalog.listUnits(),
    inventoryUseCases().listStockLevels(),
  ]);
  const stock = new Map(levels.map((level) => [level.productId, level.quantity]));
  const active = products.filter((p) => p.active);
  const formOptions: ProductFormOptions = {
    categories: categories.map(({ id, name }) => ({ id, name })),
    supplies: active.filter((p) => p.isSupply).map(({ id, name }) => ({ id, name })),
    units: units.map(({ id, code }) => ({ id, code: code ?? "" })),
  };
  const raw = searchParams.producto;
  const id = typeof raw === "string" && UUID.test(raw) ? raw : null;
  const detail = id ? await loadDetail(id, products, stock, formOptions.categories) : null;
  return { products: products.map((p) => toEntry(p, stock)), formOptions, detail };
}
