"use client";

import { useState, useTransition, type FormEvent } from "react";
import { formatDecimalInput, parseDecimalInput } from "@/shared/domain/format";
import { Alert, Button, Caption, Checkbox, Field, Form, NumberInput, SegmentedControl, Select, TextInput, useDialogClose, useToast } from "@/shared/ui";
import type { NewProductFormAction, ProductFormOptions, ProductKind } from "./types";

const KINDS: readonly ProductKind[] = ["Producto", "Insumo"];
/** Legacy `_renderizar_campos_receta_rapida`: two fixed rows, "Insumo 1" and "Insumo 2". */
const RECIPE_ROWS = [1, 2] as const;

interface RecipeRow {
  componentId: string;
  quantity: string;
  unit: string;
}

const digitsOnly = (text: string) => text.replace(/\D/g, "");

/**
 * Legacy `product_modal` / `render_product_form` (ui/admin/products/components/product_form.py): the "Nuevo producto"
 * dialog. The Producto/Insumo switch lives outside the form, "Insumo 1/2" rows only appear for a Producto and the
 * "Se vende" checkbox only for an Insumo. Categories cannot be created here (caption points to Administración).
 */
export function ProductForm({ options, action }: { options: ProductFormOptions; action: NewProductFormAction }) {
  const close = useDialogClose();
  const toast = useToast();
  const defaultUnit = options.units[0]?.code ?? "unidad";
  const [kind, setKind] = useState<ProductKind>("Producto");
  const [name, setName] = useState("");
  const [price, setPrice] = useState(formatDecimalInput(0));
  const [categoryId, setCategoryId] = useState(options.categories[0]?.id ?? "");
  const [sellable, setSellable] = useState(false);
  const [sku, setSku] = useState("");
  const [rows, setRows] = useState<RecipeRow[]>(() => RECIPE_ROWS.map(() => ({ componentId: "", quantity: "0", unit: defaultUnit })));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const setRow = (index: number, patch: Partial<RecipeRow>) => setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setError(null);
    const components = kind === "Producto" ? rows.filter((r) => r.componentId && Number(r.quantity) > 0) : [];
    startTransition(async () => {
      const result = await action({ kind, name, price, categoryId, sellable, sku, components });
      if (result.ok) {
        close();
        // TODO(phase-productos): the legacy then opens the new product's detail page; until /productos exists the
        // confirmation (toast + success text of the legacy product page) is shown here.
        toast(result.message ?? "Producto creado correctamente.", "✅");
      } else {
        setError(result.message ?? "No se pudo crear el producto.");
      }
    });
  };

  return (
    <>
      <SegmentedControl label="Tipo" options={KINDS} value={kind} onChange={setKind} />
      <Form onSubmit={submit} aria-busy={pending}>
        <Field label="Nombre *">
          <TextInput autoFocus value={name} placeholder="Ej: Coca Cola" onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="form-pair">
          <Field label="Precio de venta">
            <NumberInput
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onBlur={() => {
                const parsed = parseDecimalInput(price);
                if (parsed !== null) setPrice(formatDecimalInput(Math.max(0, parsed)));
              }}
            />
          </Field>
          <Field label="Categoría">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {options.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {kind === "Producto"
          ? RECIPE_ROWS.map((number, index) => (
              <div key={number} className="recipe-row">
                <Field label={`Insumo ${number}`}>
                  <Select value={rows[index].componentId} onChange={(e) => setRow(index, { componentId: e.target.value })}>
                    <option value="">No lleva insumo</option>
                    {options.supplies.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Cantidad">
                  <NumberInput value={rows[index].quantity} onChange={(e) => setRow(index, { quantity: digitsOnly(e.target.value) })} />
                </Field>
                <Field label="">
                  <Select aria-label={`Unidad del insumo ${number}`} value={rows[index].unit} onChange={(e) => setRow(index, { unit: e.target.value })}>
                    {options.units.map((u) => (
                      <option key={u.id} value={u.code}>
                        {u.code}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            ))
          : null}
        {kind === "Insumo" ? <Checkbox label="Se vende" checked={sellable} onChange={(e) => setSellable(e.target.checked)} /> : null}
        <Field label="Código interno (opcional)" help="Si lo dejás vacío, el sistema genera uno.">
          <TextInput value={sku} onChange={(e) => setSku(e.target.value)} />
        </Field>
        <Button type="submit" block formSubmit disabled={pending}>
          Crear producto
        </Button>
      </Form>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Caption>¿No está la categoría? Podés crearla desde Administración → Catálogos.</Caption>
    </>
  );
}
