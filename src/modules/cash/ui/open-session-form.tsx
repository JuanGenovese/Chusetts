"use client";

import { Field, TextInput } from "@/shared/ui";
import { ActionForm } from "./action-form";
import type { CashAction } from "./types";

export function OpenSessionForm({ action }: { action: CashAction }) {
  return (
    <ActionForm action={action} submitLabel="Abrir caja">
      <Field label="Efectivo inicial">
        <TextInput name="openingCash" inputMode="decimal" defaultValue="0" required />
      </Field>
      <Field label="Observaciones (opcional)">
        <TextInput name="notes" maxLength={500} />
      </Field>
    </ActionForm>
  );
}
