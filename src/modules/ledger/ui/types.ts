import type { Cents } from "@/shared/domain/money";
import type { ActionState } from "@/shared/ui";

export type QuickEntryKind = "Gasto" | "Compra";

export interface QuickEntryProduct {
  id: string;
  name: string;
  /** Suggested unit cost (the product's current cost). */
  unitCost: Cents;
  /** Stock units that one purchased unit adds. */
  purchaseFactor: number;
  stockUnit: string;
}

export interface QuickEntryOptions {
  /** Operating date (YYYY-MM-DD): default of the "Fecha" field. */
  businessDate: string;
  paymentMethods: { id: string; name: string; code?: string }[];
  /** Movement categories of the form's kind (legacy `get_categorias('Gasto'|'Compra')`). */
  categories: string[];
  suppliers: { id: string; name: string }[];
  /** Purchasable products ("Compra" only). */
  products: QuickEntryProduct[];
}

/** Raw form values (strings exactly as typed): the Server Action validates and parses them. */
export interface QuickEntryInput {
  kind: QuickEntryKind;
  description: string;
  category: string;
  /** "Importe" (Gasto). */
  amount: string;
  /** "Producto" id, "" = Sin producto (Compra). */
  productId: string;
  /** "Proveedor" id, "" = Sin proveedor (Compra). */
  supplierId: string;
  quantity: string;
  unitCost: string;
  /** ISO date YYYY-MM-DD. */
  date: string;
  paymentMethod: string;
}

export type QuickEntryAction = (input: QuickEntryInput) => Promise<ActionState>;

/** Input of the POS sale action (ids + quantities; prices are re-read on the server). */
export interface SaleActionInput {
  lines: { productId: string; quantity: number }[];
  /** Payment method display name, as the legacy `save_ticket(medio_pago, ...)`. */
  paymentMethod: string;
  notes: string;
}

/** `message` is the flash text on success ("Venta confirmada. Ticket: ...") and the error text on failure. */
export type SaleAction = (input: SaleActionInput) => Promise<ActionState>;

export interface PosProduct {
  id: string;
  name: string;
  /** Category name; empty when it has none (the screen shows "Sin categoría"). */
  category: string;
  price: Cents;
  /** Units that can be sold now (stock or recipe); null = no stock control. */
  available: number | null;
}

export interface PosData {
  /** The user's cash register is open (legacy `get_open_session`). */
  hasOpenCash: boolean;
  /** Sellable, active products in legacy order; empty when the register is closed. */
  products: PosProduct[];
  /** Active payment methods in legacy order. */
  paymentMethods: { id: string; name: string; code: string }[];
}
