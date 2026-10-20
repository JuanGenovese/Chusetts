"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ROLE_LABELS, type NavItem, type NavRole } from "../navigation";

type SidebarState = "auto" | "open" | "closed";

const MOBILE_QUERY = "(max-width: 760px)";

function DoubleChevron({ direction }: { direction: "left" | "right" }) {
  const d = direction === "left" ? "M11 17 6 12l5-5M18 17l-5-5 5-5" : "m13 17 5-5-5-5M6 17l5-5-5-5";
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export interface AppShellProps {
  user: { displayName: string; role: NavRole };
  nav: NavItem[];
  /** Server Action that signs the user out and redirects to the login screen. */
  logoutAction: () => Promise<void>;
  children: ReactNode;
}

/**
 * Chrome of every authenticated page: gradient sidebar (288px) and the
 * Streamlit-like main column. Deviation: below 760px the sidebar starts collapsed and opens as an overlay.
 */
export function AppShell({ user, nav, logoutAction, children }: AppShellProps) {
  const pathname = usePathname();
  const [sidebar, setSidebar] = useState<SidebarState>("auto");

  const isMobile = () => window.matchMedia(MOBILE_QUERY).matches;
  const toggle = () => {
    const visible = sidebar === "open" || (sidebar === "auto" && !isMobile());
    setSidebar(visible ? "closed" : "open");
  };

  return (
    <div className="app-shell" data-sidebar={sidebar}>
      <aside className="sidebar" aria-label="Navegación principal">
        <button type="button" className="sidebar-toggle" aria-label="Cerrar barra lateral" onClick={toggle}>
          <DoubleChevron direction="left" />
        </button>
        <h1 className="sidebar-title">🍺 Chusetts</h1>
        <p className="sidebar-caption">Usuario: {user.displayName}</p>
        <p className="sidebar-caption">Rol: {ROLE_LABELS[user.role]}</p>
        <div className="sidebar-menu-label">Menú</div>
        <nav className="sidebar-nav">
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="sidebar-nav-item"
                aria-current={active ? "page" : undefined}
                onClick={() => isMobile() && setSidebar("closed")}
              >
                {active ? "●" : "○"}&nbsp;{item.title}
              </Link>
            );
          })}
        </nav>
        <hr className="sidebar-divider" />
        {user.role === "cashier" ? <div className="sidebar-note">Modo caja: solo ventas y anulaciones propias.</div> : null}
        <form action={logoutAction}>
          <button type="submit" className="sidebar-logout">
            Cerrar sesión
          </button>
        </form>
      </aside>
      <div className="sidebar-backdrop" onClick={() => setSidebar("closed")} />
      <button type="button" className="sidebar-expand" aria-label="Abrir barra lateral" onClick={toggle}>
        <DoubleChevron direction="right" />
      </button>
      <div className="app-main">
        <div className="block-container">
          <div className="stack">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
