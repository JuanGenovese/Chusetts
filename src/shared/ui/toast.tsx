"use client";

import { useEffect, type ReactNode } from "react";

/** st.toast: top-right card that dismisses itself after ~4s. */
export function Toast({ icon, children, onDismiss }: { icon?: string; children: ReactNode; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);
  return (
    <div className="toast-region" role="status">
      <div className="toast">
        {icon ? <span aria-hidden>{icon}</span> : null}
        <span>{children}</span>
        <button type="button" className="toast-close" aria-label="Cerrar" onClick={onDismiss}>
          ×
        </button>
      </div>
    </div>
  );
}
