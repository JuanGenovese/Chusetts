import type { Cents } from "@/shared/domain/money";
import type { Product } from "../domain";
import type { UpdateProductInput } from "./catalog-service";

/** What the "Ficha" form of the product page edits (legacy `_render_edit_form`). */
export interface ProductFichaEdits {
  name: string;
  categoryId: string;
  price: Cents;
  /** "Se vende": only supplies show the checkbox. */
  sellable: boolean;
  sku: string;
}

/**
 * Builds the `updateProduct` input of a Ficha save: the edited fields on top of the saved product, so that stock
 * control, units, costs, supplier and compound flags (and therefore how the POS sells the product) are untouched.
 */
export function productUpdateFromEdits(product: Product, edits: ProductFichaEdits, actorId: string): UpdateProductInput {
  const isSellable = product.isSupply ? edits.sellable : product.isSellable;
  return {
    id: product.id,
    name: edits.name,
    categoryId: edits.categoryId,
    isSellable,
    controlsStock: product.controlsStock,
    stockUnit: product.stockUnit,
    salePrice: product.isSupply && !isSellable ? 0 : edits.price,
    unitCost: product.unitCost,
    minStock: product.minStock,
    sku: edits.sku,
    description: product.description,
    isPurchasable: product.isPurchasable,
    isSupply: product.isSupply,
    isCompound: product.isCompound,
    purchaseUnit: product.purchaseUnit,
    purchaseFactor: product.purchaseFactor,
    supplierId: product.supplierId,
    actorId,
  };
}
