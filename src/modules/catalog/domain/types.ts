import type { Cents } from "@/shared/domain/money";

/** A selectable relation (legacy `ModelOption`, the many2one equivalent). */
export interface ModelOption {
  id: string;
  name: string;
  code?: string;
}

export interface Product {
  id: string;
  /** Display number; also the source of the generated SKU ("P-0001"). */
  number: number;
  name: string;
  sku: string;
  description: string;
  categoryId: string;
  categoryName: string;
  salePrice: Cents;
  unitCost: Cents;
  minStock: number;
  active: boolean;
  isSellable: boolean;
  isPurchasable: boolean;
  /** Supply / ingredient ("insumo"). */
  isSupply: boolean;
  /** Sold as a combination of other products; has no stock of its own. */
  isCompound: boolean;
  controlsStock: boolean;
  /** Canonical stock unit code (unidad, ml, l, g, kg). */
  stockUnit: string;
  stockUnitId: string;
  stockUnitName: string;
  purchaseUnit: string;
  /** Stock units that one purchased presentation adds. */
  purchaseFactor: number;
  supplierId: string | null;
  supplierName: string | null;
  createdAt: Date;
  updatedAt: Date | null;
  updatedBy: string | null;
}

export interface ProductCategory {
  id: string;
  name: string;
  active: boolean;
  sequence: number;
  createdAt: Date;
  updatedAt: Date | null;
  updatedBy: string | null;
}

export interface ProductCategoryRecord extends ProductCategory {
  /** Active products assigned to the category. */
  assignedProducts: number;
}

export interface Supplier {
  id: string;
  name: string;
  legalName: string;
  /** CUIT. */
  taxId: string;
  /** Rubro. */
  business: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date | null;
  updatedBy: string | null;
}

export type UnitMagnitude = "unidad" | "volumen" | "peso";

export interface Unit {
  id: string;
  code: string;
  name: string;
  magnitude: UnitMagnitude;
  baseFactor: number;
  active: boolean;
}

export interface PaymentMethod {
  id: string;
  code: string;
  name: string;
  active: boolean;
  sequence: number;
}

/** Legacy `categorias.tipo` values (user-visible Spanish data). */
export type MovementCategoryKind = "Ingreso" | "Gasto" | "Compra";

export interface MovementCategory {
  id: string;
  name: string;
  kind: MovementCategoryKind;
  active: boolean;
}
