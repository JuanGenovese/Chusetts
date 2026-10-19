"use client";

import { Field, TextInput, inputClass } from "@/shared/ui";
import { MANUAL_MOVEMENT_LABELS, type ManualMovementType } from "../domain";
import { ActionForm } from "./action-form";
import type { CashAction } from "./types";

export function ManualMovementForm({ action }: { action: CashAction }) {
  return (
    <ActionForm action={action} submitLabel="Registrar movimiento">
      <Field label="Tipo de movimiento">
        <select name="type" className={inputClass} defaultValue="WITHDRAWAL">
          {(Object.keys(MANUAL_MOVEMENT_LABELS) as ManualMovementType[]).map((type) => (
            <option key={type} value={type}>
              {MANUAL_MOVEMENT_LABELS[type]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Monto">
        <TextInput name="amount" inputMode="decimal" required />
      </Field>
      <Field label="Motivo">
        <TextInput name="reason" maxLength={500} required />
      </Field>
    </ActionForm>
  );
}
