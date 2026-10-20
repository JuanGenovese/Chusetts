"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Toast } from "./toast";

interface ToastState {
  id: number;
  message: string;
  icon?: string;
}

const ToastContext = createContext<((message: string, icon?: string) => void) | null>(null);

/** Hosts one `st.toast` at a time; descendants call `useToast()(message, icon)`. */
export function ToastHost({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const show = useCallback((message: string, icon?: string) => setToast((prev) => ({ id: (prev?.id ?? 0) + 1, message, icon })), []);
  const dismiss = useCallback(() => setToast(null), []);
  const value = useMemo(() => show, [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Toast key={toast.id} icon={toast.icon} onDismiss={dismiss}>
          {toast.message}
        </Toast>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): (message: string, icon?: string) => void {
  return useContext(ToastContext) ?? (() => {});
}
