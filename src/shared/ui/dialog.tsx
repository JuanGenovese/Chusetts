"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";

const DialogCloseContext = createContext<(() => void) | null>(null);

/** Lets a form rendered inside a `Dialog` close it (st.dialog closes when the script reruns without it). */
export function useDialogClose(): () => void {
  return useContext(DialogCloseContext) ?? (() => {});
}

/** st.dialog (width "medium"): dismiss with the X, Escape or a click outside. */
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="dialog-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2 className="dialog-title">{title}</h2>
        <button type="button" className="dialog-close" aria-label="Cerrar" onClick={onClose}>
          ×
        </button>
        <DialogCloseContext.Provider value={onClose}>
          <div className="stack">{children}</div>
        </DialogCloseContext.Provider>
      </div>
    </div>
  );
}
