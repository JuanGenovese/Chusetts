import { isCents, type Cents } from "@/shared/domain/money";
import { normalizeUnit, type CanonicalUnit } from "@/modules/inventory";
import { CatalogError } from "./errors";

/** Legacy `printf('P-%04d', id)`. */
export function defaultSku(productNumber: number): string {
  return `P-${String(productNumber).padStart(4, "0")}`;
}

function assertMoney(salePrice: Cents, unitCost: Cents): void {
  if (!isCents(salePrice) || !isCents(unitCost)) {
    throw new CatalogError("El importe debe ser un número entero de centavos.");
  }
  if (salePrice < 0) throw new CatalogError("El precio de venta no puede ser negativo.");
  if (unitCost < 0) throw new CatalogError("El costo no puede ser negativo.");
}

interface CommonProductFields {
  name: string;
  stockUnit: string;
  purchaseUnit?: string | null;
  purchaseFactor: number;
  minStock: number;
  salePrice: Cents;
  unitCost: Cents;
}

export interface NewProductFields extends CommonProductFields {
  controlsStock: boolean;
  isCompound: boolean;
  initialStock: number;
}

export interface ValidatedProductFields {
  name: string;
  stockUnit: CanonicalUnit;
  purchaseUnit: string;
  purchaseFactor: number;
}

function validateCommon(input: CommonProductFields): ValidatedProductFields {
  const name = input.name.trim();
  if (!name) throw new CatalogError("El nombre es obligatorio.");
  const stockUnit = normalizeUnit(input.stockUnit);
  const purchaseUnit = (input.purchaseUnit ?? "").trim().toLowerCase() || stockUnit;
  if (!(Number(input.purchaseFactor) > 0)) {
    throw new CatalogError("La conversión de compra a stock debe ser mayor que cero.");
  }
  return { name, stockUnit, purchaseUnit, purchaseFactor: Number(input.purchaseFactor) };
}

/** Ports the validations of `crear_producto` (same order, same messages). */
export function validateNewProduct(input: NewProductFields): ValidatedProductFields & { controlsStock: boolean } {
  const common = validateCommon(input);
  if (Number(input.initialStock) < 0 || Number(input.minStock) < 0) {
    throw new CatalogError("El stock no puede ser negativo.");
  }
  const controlsStock = input.isCompound ? false : input.controlsStock;
  if (!controlsStock && Number(input.initialStock) !== 0) {
    throw new CatalogError("Un producto sin stock propio no puede tener stock inicial.");
  }
  assertMoney(input.salePrice, input.unitCost);
  return { ...common, controlsStock };
}

/** Ports the validations of `actualizar_producto`. */
export function validateProductUpdate(input: CommonProductFields): ValidatedProductFields {
  const common = validateCommon(input);
  if (Number(input.minStock) < 0) throw new CatalogError("El stock mínimo no puede ser negativo.");
  assertMoney(input.salePrice, input.unitCost);
  return common;
}

export interface SupplierFields {
  name: string;
  legalName?: string;
  taxId?: string;
  business?: string;
  contact?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export type CleanSupplierFields = Required<SupplierFields>;

/** Ports `_validate_supplier_values`. */
export function validateSupplierValues(input: SupplierFields): CleanSupplierFields {
  const name = input.name.trim();
  if (!name) throw new CatalogError("El nombre del proveedor es obligatorio.");
  const email = (input.email ?? "").trim().toLowerCase();
  if (email && !email.includes("@")) throw new CatalogError("El correo electrónico no tiene un formato válido.");
  const taxId = (input.taxId ?? "").trim();
  if (taxId && !/^[0-9-]+$/.test(taxId)) throw new CatalogError("El CUIT solo puede contener números y guiones.");
  return {
    name,
    legalName: (input.legalName ?? "").trim(),
    taxId,
    business: (input.business ?? "").trim(),
    contact: (input.contact ?? "").trim(),
    phone: (input.phone ?? "").trim(),
    email,
    address: (input.address ?? "").trim(),
    notes: (input.notes ?? "").trim(),
  };
}
