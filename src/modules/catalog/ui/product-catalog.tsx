"use client";

import { useState } from "react";
import { Alert, Button, Caption, Columns, Field, PageHeader, Select, TextInput } from "@/shared/ui";
import {
  CATALOG_KIND_OPTIONS,
  CATALOG_STATUS_OPTIONS,
  CATALOG_STOCK_OPTIONS,
  DEFAULT_CATALOG_FILTERS,
  catalogCardStockLabel,
  catalogPriceLabel,
  filterCatalog,
  type CatalogEntry,
  type CatalogFilters,
} from "../domain";

const NO_CATEGORY = "Sin categoría";

function CatalogCard({ product, onOpen }: { product: CatalogEntry; onOpen: (id: string) => void }) {
  return (
    <>
      <div className="product-card md" style={{ "--mb": "10px" } as React.CSSProperties}>
        <div>
          <div className="product-name">{product.name}</div>
          <div className="product-meta">{product.categoryName || NO_CATEGORY}</div>
        </div>
        <div className="product-card-footer">
          <div className="product-stock">{catalogCardStockLabel(product)}</div>
          <div className="product-price">{catalogPriceLabel(product)}</div>
        </div>
      </div>
      <Button block variant="secondary" onClick={() => onOpen(product.id)}>
        Abrir ficha
      </Button>
    </>
  );
}

/**
 * Legacy `render_catalog_grid` (ui/admin/products/components/catalog_grid.py): "＋ Nuevo producto", the filter card
 * (search, status, kind, stock) and the 3-column grid of POS-style cards with an "Abrir ficha" button each.
 */
export function ProductCatalog({
  products,
  onNewProduct,
  onOpen,
}: {
  products: CatalogEntry[];
  onNewProduct: () => void;
  onOpen: (id: string) => void;
}) {
  const [filters, setFilters] = useState<CatalogFilters>(DEFAULT_CATALOG_FILTERS);
  const set = <K extends keyof CatalogFilters>(key: K, value: CatalogFilters[K]) => setFilters((prev) => ({ ...prev, [key]: value }));
  const filtered = filterCatalog(products, filters);

  return (
    <>
      <PageHeader title="Productos e inventario" subtitle="Un catálogo claro para vender, comprar, controlar insumos y definir recetas." />
      <Columns weights={[4, 1]}>
        <div aria-hidden />
        <Button block onClick={onNewProduct}>
          ＋ Nuevo producto
        </Button>
      </Columns>
      {products.length === 0 ? (
        <Alert tone="info">Todavía no hay productos. Creá el primero para comenzar.</Alert>
      ) : (
        <>
          <div className="bordered-box">
            <Columns weights={[2.2, 1.2, 1.2, 1.2]}>
              <Field label="Buscar">
                <TextInput value={filters.search} placeholder="Nombre, código o categoría" onChange={(e) => set("search", e.target.value)} />
              </Field>
              <Field label="Estado">
                <Select value={filters.status} onChange={(e) => set("status", e.target.value as CatalogFilters["status"])}>
                  {CATALOG_STATUS_OPTIONS.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Tipo">
                <Select value={filters.kind} onChange={(e) => set("kind", e.target.value as CatalogFilters["kind"])}>
                  {CATALOG_KIND_OPTIONS.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Stock">
                <Select value={filters.stock} onChange={(e) => set("stock", e.target.value as CatalogFilters["stock"])}>
                  {CATALOG_STOCK_OPTIONS.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </Select>
              </Field>
            </Columns>
          </div>
          <Caption>{filtered.length} producto(s) encontrados</Caption>
          <Columns>
            {[0, 1, 2].map((col) => (
              <div className="stack" key={col}>
                {filtered
                  .filter((_, idx) => idx % 3 === col)
                  .map((product) => (
                    <CatalogCard key={product.id} product={product} onOpen={onOpen} />
                  ))}
              </div>
            ))}
          </Columns>
        </>
      )}
    </>
  );
}
