"use client";

import { createContext, useCallback, useContext, useState, useTransition } from "react";
import type { ActionState } from "@/shared/ui";

export interface FlashApi {
  show: (message: string) => void;
  clear: () => void;
}

/**
 * Legacy `set_flash_message` / `pop_flash_message`: a message is shown as a ✅ toast AND a success alert on the page;
 * the next action or navigation pops it.
 */
export const FlashContext = createContext<FlashApi>({ show: () => {}, clear: () => {} });

export function useFlash(): FlashApi {
  return useContext(FlashContext);
}

/**
 * Runs one Server Action of the product screens: the success message becomes the page flash, a failure is kept as the
 * form's error text (legacy `st.error` under the form). Ignores clicks while another run is pending.
 */
export function useProductAction() {
  const { show, clear } = useFlash();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = useCallback(
    (work: () => Promise<ActionState>, onSuccess?: () => void) => {
      if (pending) return;
      setError(null);
      clear();
      startTransition(async () => {
        const result = await work();
        if (result.ok) {
          show(result.message ?? "");
          onSuccess?.();
        } else {
          setError(result.message ?? "No se pudo completar la operación.");
        }
      });
    },
    [show, clear, pending],
  );
  return { run, pending, error, clearError: () => setError(null) };
}
