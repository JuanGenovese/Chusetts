import type { Cents } from "@/shared/domain/money";
import type { ActionState } from "@/shared/ui";
import type { CatalogEntry } from "../domain";
import type { NewProductFormAction, ProductFormOptions } from "./types";

/** The product being viewed in the detail page (legacy `get_producto` row, only what the screen reads). */
export interface ProductDetailView {
  id: string;
  name: string;
  sku: string;
  categoryId: string;
  categoryName: string;
  salePrice: Cents;
  active: boolean;
  isSellable: boolean;
  isSupply: boolean;
  controlsStock: boolean;
  /** Current stock in `stockUnit` (0 when the product has none). */
  stock: number;
  stockUnit: string;
}

/** Legacy `get_product_recipe` row. */
export interface RecipeLineView {
  id: string;
  componentName: string;
  quantity: number;
  unit: string;
  stockQuantity: number;
  stockUnit: string;
}

/** A stock-controlled product that can be a recipe component, with the units its quantity may be typed in. */
export interface RecipeComponentOption {
  id: string;
  name: string;
  stockUnit: string;
  /** Compatible units, in legacy order; the stock unit is the default. */
  units: string[];
}

/** Legacy `get_stock_movements` row, display ready. */
export interface StockHistoryView {
  id: string;
  type: string;
  /** Local timestamp ("2026-10-19 18:33:12"). */
  at: string;
  actor: string;
  delta: number;
  before: number;
  after: number;
  reason: string;
}

export interface ProductDetailData {
  product: ProductDetailView;
  categories: { id: string; name: string }[];
  recipe: RecipeLineView[];
  recipeComponents: RecipeComponentOption[];
  history: StockHistoryView[];
}

export interface ProductsData {
  products: CatalogEntry[];
  formOptions: ProductFormOptions;
  /** Set when the URL names an existing product (`?producto=`). */
  detail: ProductDetailData | null;
}

export interface UpdateProductFormInput {
  id: string;
  name: string;
  /** Raw typed price ("4500,00"). */
  price: string;
  categoryId: string;
  /** "Se vende" (supplies only; products keep their saved value). */
  sellable: boolean;
  sku: string;
}

export interface ProductsActions {
  create: NewProductFormAction;
  update: (input: UpdateProductFormInput) => Promise<ActionState>;
  deactivate: (input: { productId: string }) => Promise<ActionState>;
  restore: (input: { productId: string }) => Promise<ActionState>;
  adjustStock: (input: { productId: string; counted: string; reason: string }) => Promise<ActionState>;
  saveRecipeComponent: (input: { productId: string; componentId: string; quantity: string; unit: string }) => Promise<ActionState>;
  removeRecipeComponent: (input: { productId: string; recipeId: string }) => Promise<ActionState>;
}
