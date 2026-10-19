import type { ReactNode } from "react";

export function Alert({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  const styles = tone === "error" ? "border-red-300 bg-red-50 text-red-800" : "border-emerald-300 bg-emerald-50 text-emerald-800";
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${styles}`}>
      {children}
    </p>
  );
}
