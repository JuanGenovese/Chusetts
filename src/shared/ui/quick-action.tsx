import type { ButtonHTMLAttributes } from "react";

/** Admin home "Accesos rápidos": the button IS the card (legacy `st-key-quick_action*`). */
export function QuickActionCard({ className = "", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...props} className={`quick-action ${className}`}>
      {children}
    </button>
  );
}

export function QuickActions({ children }: { children: React.ReactNode }) {
  return <div className="quick-actions">{children}</div>;
}
