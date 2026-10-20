"use client";

import { formatQuantityLabel } from "@/shared/domain/format";
import { formatMoney } from "@/shared/domain/money";
import { Alert, Button, Columns, Metric, PageHeader, RecordList, Tabs, type RecordItem, type TabDefinition } from "@/shared/ui";
import { ProductEditTab } from "./product-edit-tab";
import { ProductRecipeTab } from "./product-recipe-tab";
import { ProductStockTab } from "./product-stock-tab";
import type { ProductDetailData, ProductsActions, StockHistoryView } from "./products-types";

/** Legacy `record_list` default limit. */
const HISTORY_LIMIT = 60;

const historyRecord = (row: StockHistoryView): RecordItem => ({
  key: row.id,
  title: row.type || "Sin nombre",
  subtitle: [row.at, row.actor].filter(Boolean).join(" · "),
  fields: [
    { label: "Variación", value: formatQuantityLabel(row.delta) },
    { label: "Stock", value: `${formatQuantityLabel(row.before)} → ${formatQuantityLabel(row.after)}` },
    ...(row.reason ? [{ label: "Motivo", value: row.reason }] : []),
  ],
});

function HistoryTab({ history }: { history: StockHistoryView[] }) {
  if (history.length === 0) return <Alert tone="info">Este producto todavía no tiene movimientos de inventario.</Alert>;
  return (
    <div className="stack">
      <RecordList records={history.slice(0, HISTORY_LIMIT).map(historyRecord)} />
    </div>
  );
}

/** Legacy `render_product_detail`: back button, header, four metrics and the Ficha / Inventario / [Receta] / Historial tabs. */
export function ProductDetail({ detail, actions, onBack }: { detail: ProductDetailData; actions: ProductsActions; onBack: () => void }) {
  const { product } = detail;
  const tabs: TabDefinition[] = [
    { id: "ficha", label: "Ficha", content: <ProductEditTab detail={detail} actions={actions} /> },
    { id: "inventario", label: "Inventario", content: <ProductStockTab product={product} actions={actions} /> },
    ...(product.isSupply ? [] : [{ id: "receta", label: "Receta", content: <ProductRecipeTab detail={detail} actions={actions} /> }]),
    { id: "historial", label: "Historial", content: <HistoryTab history={detail.history} /> },
  ];

  return (
    <>
      <div>
        <Button variant="secondary" onClick={onBack}>
          ← Volver al catálogo
        </Button>
      </div>
      <PageHeader title={product.name} subtitle={`${product.sku || "Sin código"} · ${product.categoryName || "Sin categoría"}`} />
      <Columns>
        <Metric label="Tipo" value={product.isSupply ? "Insumo" : "Producto"} />
        <Metric label="Precio" value={product.isSellable ? formatMoney(product.salePrice) : "No vendible"} />
        <Metric label="Stock" value={product.controlsStock ? `${formatQuantityLabel(product.stock)} ${product.stockUnit}` : "Por receta"} />
        <Metric label="Estado" value={product.active ? "Activo" : "Inactivo"} />
      </Columns>
      <Tabs key={product.id} tabs={tabs} />
    </>
  );
}
