"use client";

import { useActionState, useTransition, type FormEvent } from "react";
import { formatPesosInput, type Cents } from "@/shared/domain/money";
import { Alert, Button, Field, Form, NumberInput, TextArea } from "@/shared/ui";
import type { CashAction, CashActionState } from "./types";

const initial: CashActionState = { ok: false };

interface ShiftFormProps {
  action: CashAction;
  /** Called when a submission starts (clears the previous flash) and when it succeeds. */
  onSubmitted: () => void;
  onSucceeded: (message: string) => void;
}

/**
 * Container for a Streamlit-like form: keeps what the user typed when the server rejects it (React's form
 * `action` would reset the fields), shows the error under the form, and reports success upwards as a flash.
 */
function useShiftForm({ action, onSubmitted, onSucceeded }: ShiftFormProps) {
  const [state, dispatch] = useActionState(
    async (prev: CashActionState, formData: FormData) => {
      const result = await action(prev, formData);
      if (result.ok) onSucceeded(result.message ?? "");
      return result;
    },
    initial,
  );
  const [pending, startTransition] = useTransition();
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    onSubmitted();
    startTransition(() => dispatch(data));
  };
  return { error: state.ok ? undefined : state.message, onSubmit, pending };
}

export function OpenShiftForm(props: ShiftFormProps) {
  const { error, onSubmit, pending } = useShiftForm(props);
  return (
    <>
      <Form onSubmit={onSubmit} aria-busy={pending}>
        <Field label="Efectivo inicial">
          <NumberInput name="openingCash" defaultValue={formatPesosInput(0)} />
        </Field>
        <Field label="Observación opcional">
          <TextArea name="notes" maxLength={500} />
        </Field>
        <Button type="submit" block formSubmit>
          Abrir caja
        </Button>
      </Form>
      {error ? <Alert tone="error">{error}</Alert> : null}
    </>
  );
}

export function CloseShiftForm({ expectedCash, ...props }: ShiftFormProps & { expectedCash: Cents }) {
  const { error, onSubmit, pending } = useShiftForm(props);
  return (
    <>
      <Form onSubmit={onSubmit} aria-busy={pending}>
        <Field label="Efectivo contado físicamente">
          <NumberInput name="countedCash" defaultValue={formatPesosInput(Math.max(0, expectedCash))} />
        </Field>
        <Field label="Observación de cierre opcional">
          <TextArea name="notes" maxLength={500} />
        </Field>
        <Button type="submit" block formSubmit>
          Cerrar caja y generar backup
        </Button>
      </Form>
      {error ? <Alert tone="error">{error}</Alert> : null}
    </>
  );
}
