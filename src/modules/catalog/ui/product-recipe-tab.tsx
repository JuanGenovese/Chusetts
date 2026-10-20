"use client";

import { useState, type FormEvent } from "react";
import { formatQuantityLabel } from "@/shared/domain/format";
import { Alert, Button, Caption, Columns, Field, Form, NumberInput, RecordList, Select, Subheader, type RecordItem } from "@/shared/ui";
import { useProductAction } from "./product-flash";
import type { ProductDetailData, ProductsActions, RecipeComponentOption } from "./products-types";

const DEFAULT_QUANTITY = "1,0000";

const recipeRecord = (line: ProductDetailData["recipe"][number]): RecordItem => ({
  key: line.id,
  title: line.componentName,
  fields: [
    { label: "Consume por venta", value: `${formatQuantityLabel(line.quantity)} ${line.unit}` },
    { label: "Descuenta del stock", value: `${formatQuantityLabel(line.stockQuantity)} ${line.stockUnit}` },
  ],
});

function AddComponentForm({ productId, component, actions }: { productId: string; component: RecipeComponentOption; actions: ProductsActions }) {
  const add = useProductAction();
  const [quantity, setQuantity] = useState(DEFAULT_QUANTITY);
  const [unit, setUnit] = useState(component.units.includes(component.stockUnit) ? component.stockUnit : (component.units[0] ?? ""));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    add.run(() => actions.saveRecipeComponent({ productId, componentId: component.id, quantity, unit }));
  };

  return (
    <>
      <Form onSubmit={submit} aria-busy={add.pending}>
        <Columns>
          <Field label="Cantidad consumida" help="Cantidad de este componente que se descuenta por cada unidad vendida del producto principal.">
            <NumberInput value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </Field>
          <Field label="Unidad" help="El sistema convierte automáticamente entre unidades compatibles, por ejemplo litros y mililitros.">
            <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
              {component.units.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </Select>
          </Field>
        </Columns>
        <div>
          <Button type="submit" formSubmit disabled={add.pending}>
            Agregar o actualizar componente
          </Button>
        </div>
      </Form>
      {add.error ? <Alert tone="error">{add.error}</Alert> : null}
    </>
  );
}

/** Legacy `render_recipe_tab` ("Receta" tab, products only): what each unit sold consumes. */
export function ProductRecipeTab({ detail, actions }: { detail: ProductDetailData; actions: ProductsActions }) {
  const { product, recipe, recipeComponents } = detail;
  const remove = useProductAction();
  const [componentId, setComponentId] = useState(recipeComponents[0]?.id ?? "");
  const [removeId, setRemoveId] = useState("");

  const selected = recipeComponents.find((c) => c.id === componentId) ?? recipeComponents[0];
  const toRemove = recipe.find((line) => line.id === removeId) ?? recipe[0];

  return (
    <>
      <Subheader>Componentes por cada unidad vendida</Subheader>
      <Caption>Ejemplo: un vaso de fernet puede consumir 70 ml de Fernet y 230 ml de Coca-Cola.</Caption>
      {recipe.length === 0 ? (
        <Alert tone="info">Todavía no hay componentes. Al agregar el primero, el producto pasará a descontar por receta.</Alert>
      ) : (
        <div className="stack">
          <RecordList records={recipe.map(recipeRecord)} />
        </div>
      )}
      {selected ? (
        <>
          <Field label="Componente">
            <Select value={selected.id} onChange={(e) => setComponentId(e.target.value)}>
              {recipeComponents.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · stock en {c.stockUnit}
                </option>
              ))}
            </Select>
          </Field>
          <AddComponentForm key={selected.id} productId={product.id} component={selected} actions={actions} />
        </>
      ) : null}
      {toRemove ? (
        <>
          <Field label="Quitar componente">
            <Select value={toRemove.id} onChange={(e) => setRemoveId(e.target.value)}>
              {recipe.map((line) => (
                <option key={line.id} value={line.id}>
                  {line.componentName} · {formatQuantityLabel(line.quantity)} {line.unit}
                </option>
              ))}
            </Select>
          </Field>
          <div>
            <Button
              variant="secondary"
              disabled={remove.pending}
              onClick={() => remove.run(() => actions.removeRecipeComponent({ productId: product.id, recipeId: toRemove.id }), () => setRemoveId(""))}
            >
              Quitar de la receta
            </Button>
          </div>
          {remove.error ? <Alert tone="error">{remove.error}</Alert> : null}
        </>
      ) : null}
    </>
  );
}
