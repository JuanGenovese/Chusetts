import type { ReactNode } from "react";

export type AlertTone = "success" | "error" | "warning" | "info";

/** st.success / st.error / st.warning / st.info. */
export function Alert({ tone, children }: { tone: AlertTone; children: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`alert alert-${tone}`}>
      <p>{children}</p>
    </div>
  );
}
