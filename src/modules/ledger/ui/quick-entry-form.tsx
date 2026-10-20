"use client";

import { useState, useTransition } from "react";
import { formatBusinessDate, formatDecimalInput, formatQuantityLabel, parseDecimalInput } from "@/shared/domain/format";
import { formatMoneyCompact } from "@/shared/domain/money";
import { Alert, Button, Caption, Columns, DateInput, Field, NumberInput, Select, TextInput, useDialogClose } from "@/shared/ui";
import type { QuickEntryAction, QuickEntryKind, QuickEntryOptions } from "./types";

interface FormState {
  description: string;
  category: string;
  amount: string;
  productId: string;
  supplierId: string;
  quantity: string;
  unitCost: string;
  date: string;
  paymentMethod: string;
}

const NO_CATEGORY = "Sin categoría";

function initialState(options: QuickEntryOptions): FormState {
  const nave = options.paymentMethods.find((m) => m.code === "NAVE") ?? options.paymentMethods[0];
  return {
    description: "",
    category: options.categories[0] ?? NO_CATEGORY,
    amount: formatDecimalInput(0),
    productId: "",
    supplierId: "",
    quantity: formatDecimalInput(1),
    unitCost: formatDecimalInput(0),
    date: options.businessDate,
    paymentMethod: nave?.name ?? "",
  };
}

/** Amount typed in pesos -> number (invalid = 0, like an untouched Streamlit number input). */
const pesos = (text: string) => parseDecimalInput(text) ?? 0;
const compact = (valuePesos: number) => formatMoneyCompact(Math.round(valuePesos * 100));

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-summary-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

/**
 * Legacy `modal_carga_rapida` (ui/admin/quick_entry.py) for "Gasto" and "Compra": left panel with the fields, right
 * "Resumen" with Guardar / Limpiar. Saving closes the dialog (the legacy shows a success and reruns, which closes
 * `st.dialog`); an error stays inline and keeps what was typed.
 */
export function QuickEntryForm({ kind, options, action }: { kind: QuickEntryKind; options: QuickEntryOptions; action: QuickEntryAction }) {
  const close = useDialogClose();
  const [state, setState] = useState<FormState>(() => initialState(options));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isPurchase = kind === "Compra";

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setState((prev) => ({ ...prev, [key]: value }));
  const product = options.products.find((p) => p.id === state.productId);
  const supplier = options.suppliers.find((s) => s.id === state.supplierId);

  const selectProduct = (productId: string) => {
    const next = options.products.find((p) => p.id === productId);
    // Product-keyed widgets in the legacy reset to their defaults when the product changes.
    setState((prev) => ({
      ...prev,
      productId,
      quantity: formatDecimalInput(1),
      unitCost: formatDecimalInput(next ? next.unitCost / 100 : 0),
      description: next ? next.name : "",
    }));
  };

  const quantity = pesos(state.quantity);
  const unitCost = pesos(state.unitCost);
  const total = isPurchase ? quantity * unitCost : pesos(state.amount);
  const factor = product?.purchaseFactor || 1;

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await action({ kind, ...state });
      if (result.ok) close();
      else setError(result.message ?? "No se pudo guardar el movimiento.");
    });
  };

  const paymentField = (
    <Field label="Medio de pago">
      <Select value={state.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)}>
        {options.paymentMethods.map((m) => (
          <option key={m.id} value={m.name}>
            {m.name}
          </option>
        ))}
      </Select>
    </Field>
  );
  const categoryField = (
    <Field label="Categoría *">
      <Select value={state.category} onChange={(e) => set("category", e.target.value)}>
        {(options.categories.length > 0 ? options.categories : [NO_CATEGORY]).map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>
    </Field>
  );
  const dateField = (
    <Field label="Fecha">
      <DateInput value={state.date} onChange={(iso) => set("date", iso)} />
    </Field>
  );
  const decimal = (key: "amount" | "quantity" | "unitCost") => (
    <NumberInput
      value={state[key]}
      onChange={(e) => set(key, e.target.value)}
      onBlur={() => {
        const parsed = parseDecimalInput(state[key]);
        if (parsed !== null) set(key, formatDecimalInput(Math.max(0, parsed)));
      }}
    />
  );

  return (
    <>
      <Caption>Tipo seleccionado: {kind}</Caption>
      <Columns gap="large" weights={[1.35, 0.95]}>
        <div className="stack">
          <div className="admin-panel-title md">{isPurchase ? "Datos de la compra" : "Datos del gasto"}</div>
          {isPurchase ? (
            <>
              <Field label="Producto *">
                <Select value={state.productId} onChange={(e) => selectProduct(e.target.value)}>
                  <option value="">Sin producto</option>
                  {options.products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Proveedor *" help="Relación con el modelo de proveedores.">
                <Select value={state.supplierId} onChange={(e) => set("supplierId", e.target.value)}>
                  <option value="">Sin proveedor</option>
                  {options.suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="form-pair">
                <Field label="Cantidad *">{decimal("quantity")}</Field>
                <Field label="Costo unitario *">{decimal("unitCost")}</Field>
              </div>
              <div className="form-pair">
                {categoryField}
                {dateField}
              </div>
              {paymentField}
              <Field label="Descripción / Observación">
                <TextInput value={state.description} onChange={(e) => set("description", e.target.value)} />
              </Field>
            </>
          ) : (
            <>
              <Field label="Descripción del gasto *">
                <TextInput
                  autoFocus
                  value={state.description}
                  placeholder="Ej: Sueldo, electricidad, impuesto"
                  onChange={(e) => set("description", e.target.value)}
                />
              </Field>
              {categoryField}
              <div className="form-pair">
                <Field label="Importe *">{decimal("amount")}</Field>
                {dateField}
              </div>
              {paymentField}
            </>
          )}
        </div>
        <div className="stack">
          <div className="admin-summary-head md">
            <div className="admin-summary-title">Resumen</div>
            <div className="admin-summary-subtitle">{kind}</div>
            <div className="admin-summary-header" />
          </div>
          <div className="admin-summary-card">
            <SummaryRow label="Fecha" value={formatBusinessDate(state.date)} />
            {isPurchase ? (
              <>
                <SummaryRow label="Proveedor" value={supplier?.name ?? "Sin proveedor"} />
                <SummaryRow label="Producto" value={product?.name ?? "Sin producto"} />
                <SummaryRow label="Cantidad" value={formatQuantityLabel(quantity)} />
                <SummaryRow label="Costo unitario" value={compact(unitCost)} />
                <SummaryRow label="Ingresa al stock" value={`${formatQuantityLabel(quantity * factor)} ${product?.stockUnit ?? "unidad"}`} />
              </>
            ) : (
              <>
                <SummaryRow label="Categoría" value={state.category} />
                <SummaryRow label="Descripción" value={state.description || "—"} />
              </>
            )}
            <div className="admin-summary-total">
              <span>Total</span>
              <strong>{compact(total)}</strong>
            </div>
          </div>
          <div className="dialog-actions">
            <Button block disabled={pending} onClick={save}>
              Guardar
            </Button>
            <Button block variant="secondary" disabled={pending} onClick={() => setState(initialState(options))}>
              Limpiar
            </Button>
          </div>
        </div>
      </Columns>
      {error ? <Alert tone="error">{error}</Alert> : null}
    </>
  );
}
