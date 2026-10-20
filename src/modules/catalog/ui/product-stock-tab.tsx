"use client";

import { useState, type FormEvent } from "react";
import { formatQuantityLabel } from "@/shared/domain/format";
import { Alert, Button, Field, Form, NumberInput, Paragraph, Subheader, TextInput } from "@/shared/ui";
import { useProductAction } from "./product-flash";
import type { ProductDetailView, ProductsActions } from "./products-types";

/** Streamlit float number input (step 0.1): "12,0" for whole stocks, otherwise the decimal comma value. */
const countedInput = (stock: number) => (Number.isInteger(stock) ? `${stock},0` : String(stock).replace(".", ","));

/** Legacy `render_stock_tab` ("Inventario" tab): audited physical count. */
export function ProductStockTab({ product, actions }: { product: ProductDetailView; actions: ProductsActions }) {
  if (!product.controlsStock) return <Alert tone="info">Este producto no tiene stock propio: su disponibilidad depende de su receta.</Alert>;
  // Remounted when the stock changes so the count field restarts from the new system stock (legacy value=stock_actual).
  return <StockForm key={product.stock} product={product} actions={actions} />;
}

function StockForm({ product, actions }: { product: ProductDetailView; actions: ProductsActions }) {
  const adjust = useProductAction();
  const [counted, setCounted] = useState(countedInput(product.stock));
  const [reason, setReason] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    adjust.run(() => actions.adjustStock({ productId: product.id, counted, reason }), () => setReason(""));
  };

  return (
    <>
      <Subheader>Conteo y ajuste de inventario</Subheader>
      <Paragraph>
        Stock del sistema: <strong>{formatQuantityLabel(product.stock)} {product.stockUnit}</strong>
      </Paragraph>
      <Form onSubmit={submit} aria-busy={adjust.pending}>
        <Field
          label={`Cantidad física contada (${product.stockUnit})`}
          help="Ingresá lo que contaste realmente. El sistema calculará la diferencia y dejará el ajuste registrado."
        >
          <NumberInput value={counted} onChange={(e) => setCounted(e.target.value)} />
        </Field>
        <Field label="Motivo obligatorio">
          <TextInput value={reason} placeholder="Ej.: conteo semanal, rotura o merma" onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div>
          <Button type="submit" formSubmit disabled={adjust.pending}>
            Registrar ajuste
          </Button>
        </div>
      </Form>
      {adjust.error ? <Alert tone="error">{adjust.error}</Alert> : null}
    </>
  );
}
