import type { CatalogDeps } from "./deps";
import { createCatalogService, type CatalogService } from "./catalog-service";

type AsyncMethods = {
  [K in keyof CatalogService]: CatalogService[K] extends (...args: never[]) => Promise<unknown> ? K : never;
}[keyof CatalogService];

/**
 * Stand-alone use cases: each call runs in ITS OWN unit of work (one DB transaction).
 * Callers that combine catalog work with other modules use `createCatalogService(repos, runtime)` in their own unit of work.
 */
export const catalogUseCases = (deps: CatalogDeps) => {
  const pick =
    <K extends AsyncMethods>(key: K) =>
    (...args: Parameters<CatalogService[K]>): ReturnType<CatalogService[K]> =>
      deps.uow.run((repos) => {
        const method = createCatalogService(repos, deps)[key] as (...a: unknown[]) => Promise<unknown>;
        return method(...args);
      }) as ReturnType<CatalogService[K]>;

  return {
    createProduct: pick("createProduct"),
    updateProduct: pick("updateProduct"),
    getProduct: pick("getProduct"),
    listProducts: pick("listProducts"),
    deactivateProduct: pick("deactivateProduct"),
    restoreProduct: pick("restoreProduct"),
    listProductCategories: pick("listProductCategories"),
    listProductCategoryRecords: pick("listProductCategoryRecords"),
    getProductCategory: pick("getProductCategory"),
    createProductCategory: pick("createProductCategory"),
    updateProductCategory: pick("updateProductCategory"),
    setProductCategoryActive: pick("setProductCategoryActive"),
    listSuppliers: pick("listSuppliers"),
    listSupplierRecords: pick("listSupplierRecords"),
    getSupplier: pick("getSupplier"),
    createSupplier: pick("createSupplier"),
    updateSupplier: pick("updateSupplier"),
    setSupplierActive: pick("setSupplierActive"),
    listUnits: pick("listUnits"),
    listUnitRecords: pick("listUnitRecords"),
    setUnitActive: pick("setUnitActive"),
    listPaymentMethods: pick("listPaymentMethods"),
    listPaymentMethodRecords: pick("listPaymentMethodRecords"),
    setPaymentMethodActive: pick("setPaymentMethodActive"),
    resolveActivePaymentMethod: pick("resolveActivePaymentMethod"),
    listMovementCategoryNames: pick("listMovementCategoryNames"),
    findMovementCategory: pick("findMovementCategory"),
  };
};

export type CatalogUseCases = ReturnType<typeof catalogUseCases>;
