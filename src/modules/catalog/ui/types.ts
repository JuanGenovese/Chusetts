import type { ActionState } from "@/shared/ui";

export type ProductKind = "Producto" | "Insumo";

export interface ProductFormOptions {
  /** Active product categories (categories can NOT be created from the dialog). */
  categories: { id: string; name: string }[];
  /** Active supplies ("insumos") that can be part of a recipe. */
  supplies: { id: string; name: string }[];
  /** Active units, shown by code in the recipe rows. */
  units: { id: string; code: string }[];
}

/** Raw form values: the Server Action validates and parses them. */
export interface NewProductFormInput {
  kind: ProductKind;
  name: string;
  price: string;
  categoryId: string;
  /** "Se vende" (supplies only). */
  sellable: boolean;
  sku: string;
  /** Recipe rows that have a supply and a quantity > 0. */
  components: { componentId: string; quantity: string; unit: string }[];
}

/** `productId` is the created product (set on success); the /productos screen opens its detail page with it. */
export interface NewProductResult extends ActionState {
  productId?: string;
}

export type NewProductFormAction = (input: NewProductFormInput) => Promise<NewProductResult>;
