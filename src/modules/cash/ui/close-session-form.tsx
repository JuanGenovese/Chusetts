"use client";

import { Field, TextInput } from "@/shared/ui";
import { ActionForm } from "./action-form";
import type { CashAction } from "./types";

export function CloseSessionForm({ action }: { action: CashAction }) {
  return (
    <ActionForm action={action} submitLabel="Cerrar caja">
      <Field label="Efectivo contado">
        <TextInput name="countedCash" inputMode="decimal" required />
      </Field>
      <Field label="Observaciones (opcional)">
        <TextInput name="notes" maxLength={500} />
      </Field>
    </ActionForm>
  );
}
