"use client";

import { useState, type FormEvent } from "react";
import { formatPesosInput, parsePesosToCents } from "@/shared/domain/money";
import { Alert, Button, Caption, Checkbox, Divider, Field, Form, NumberInput, Select, TextInput } from "@/shared/ui";
import { useProductAction } from "./product-flash";
import type { ProductDetailData, ProductsActions } from "./products-types";

/** Legacy `_render_edit_form` ("Ficha" tab): edit form + deactivate / restore. */
export function ProductEditTab({ detail, actions }: { detail: ProductDetailData; actions: ProductsActions }) {
  const { product, categories } = detail;
  const save = useProductAction();
  const toggle = useProductAction();
  const [name, setName] = useState(product.name);
  const [sellable, setSellable] = useState(product.isSellable);
  const [price, setPrice] = useState(formatPesosInput(product.isSellable ? product.salePrice : 0));
  // Legacy: falls back to the first category when the product's one is not among the active ones.
  const [categoryId, setCategoryId] = useState(categories.some((c) => c.id === product.categoryId) ? product.categoryId : (categories[0]?.id ?? ""));
  const [sku, setSku] = useState(product.sku);
  const [confirm, setConfirm] = useState(false);

  const priceDisabled = product.isSupply && !sellable;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save.run(() => actions.update({ id: product.id, name, price: priceDisabled ? formatPesosInput(0) : price, categoryId, sellable, sku }));
  };

  return (
    <>
      <Form onSubmit={submit} aria-busy={save.pending}>
        <Field label="Nombre *">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="form-pair">
          <div className="stack">
            {product.isSupply ? <Checkbox label="Se vende" checked={sellable} onChange={(e) => setSellable(e.target.checked)} /> : null}
            <Field label="Precio de venta">
              <NumberInput
                value={priceDisabled ? formatPesosInput(0) : price}
                disabled={priceDisabled}
                onChange={(e) => setPrice(e.target.value)}
                onBlur={() => {
                  const cents = parsePesosToCents(price);
                  if (cents !== null) setPrice(formatPesosInput(Math.max(0, cents)));
                }}
              />
            </Field>
          </div>
          <Field label="Categoría">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Código interno">
          <TextInput value={sku} onChange={(e) => setSku(e.target.value)} />
        </Field>
        <Button type="submit" block formSubmit disabled={save.pending}>
          Guardar ficha
        </Button>
      </Form>
      {save.error ? <Alert tone="error">{save.error}</Alert> : null}
      <Divider />
      {product.active ? (
        <>
          <Caption>Desactivar lo quita del catálogo sin borrar su historial.</Caption>
          <Checkbox label="Confirmo que quiero desactivar este producto" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          <div>
            <Button
              variant="secondary"
              disabled={!confirm || toggle.pending}
              onClick={() => toggle.run(() => actions.deactivate({ productId: product.id }), () => setConfirm(false))}
            >
              Desactivar producto
            </Button>
          </div>
        </>
      ) : (
        <div>
          <Button disabled={toggle.pending} onClick={() => toggle.run(() => actions.restore({ productId: product.id }))}>
            Restaurar producto
          </Button>
        </div>
      )}
      {toggle.error ? <Alert tone="error">{toggle.error}</Alert> : null}
    </>
  );
}
