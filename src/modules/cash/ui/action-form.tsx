"use client";

import { useActionState, type ReactNode } from "react";
import { Alert, Button } from "@/shared/ui";
import type { CashAction, CashActionState } from "./types";

const initial: CashActionState = { ok: false };

/** Container: owns the pending/result state of a Server Action; fields are passed as children. */
export function ActionForm({ action, submitLabel, children }: { action: CashAction; submitLabel: string; children: ReactNode }) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {children}
      {state.message ? <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Procesando..." : submitLabel}
      </Button>
    </form>
  );
}
