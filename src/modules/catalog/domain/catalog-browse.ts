import { formatQuantityLabel } from "@/shared/domain/format";
import { formatMoney, type Cents } from "@/shared/domain/money";

/** One product of the admin catalog with its current stock (legacy `get_productos(incluir_inactivos=True)` row). */
export interface CatalogEntry {
  id: string;
  name: string;
  sku: string;
  categoryName: string;
  salePrice: Cents;
  active: boolean;
  isSellable: boolean;
  isSupply: boolean;
  controlsStock: boolean;
  stock: number;
  minStock: number;
  stockUnit: string;
}

export const CATALOG_STATUS_OPTIONS = ["Activos", "Inactivos", "Todos"] as const;
export const CATALOG_KIND_OPTIONS = ["Todos", "Producto", "Insumo"] as const;
export const CATALOG_STOCK_OPTIONS = ["Todos", "Bajo", "Sin stock", "Controlado"] as const;

export interface CatalogFilters {
  search: string;
  status: (typeof CATALOG_STATUS_OPTIONS)[number];
  kind: (typeof CATALOG_KIND_OPTIONS)[number];
  stock: (typeof CATALOG_STOCK_OPTIONS)[number];
}

export const DEFAULT_CATALOG_FILTERS: CatalogFilters = { search: "", status: "Activos", kind: "Todos", stock: "Todos" };

/** Legacy `render_catalog_grid` filters (same rules, same order of checks). */
export function filterCatalog(entries: CatalogEntry[], filters: CatalogFilters): CatalogEntry[] {
  const term = filters.search.trim().toLowerCase();
  return entries.filter((product) => {
    if (filters.status === "Activos" && !product.active) return false;
    if (filters.status === "Inactivos" && product.active) return false;
    if (filters.kind === "Producto" && !product.isSellable) return false;
    if (filters.kind === "Insumo" && !product.isSupply) return false;
    if (filters.stock === "Controlado" && !product.controlsStock) return false;
    if (filters.stock === "Bajo" && (!product.controlsStock || product.stock > product.minStock)) return false;
    if (filters.stock === "Sin stock" && (!product.controlsStock || product.stock > 0)) return false;
    const haystack = `${product.name} ${product.sku} ${product.categoryName}`.toLowerCase();
    return !term || haystack.includes(term);
  });
}

/** Stock line of a catalog card: "12,5 l" or "Sin control". */
export function catalogCardStockLabel(product: CatalogEntry): string {
  return product.controlsStock ? `${formatQuantityLabel(product.stock)} ${product.stockUnit}` : "Sin control";
}

/** Price line of a catalog card (legacy `money`), "—" when the product is not sold. */
export function catalogPriceLabel(product: CatalogEntry): string {
  return product.isSellable ? formatMoney(product.salePrice) : "—";
}
