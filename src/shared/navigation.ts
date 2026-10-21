/**
 * Navigation map, identical to the legacy Streamlit app (app.py build_pages): same titles, same order,
 * same URL paths. The role's default page lives at "/".
 */
export type NavRole = "admin" | "cashier" | "developer";

export interface NavItem {
  title: string;
  href: string;
}

const CASHIER_NAV: NavItem[] = [
  { title: "Caja", href: "/" },
  { title: "Nueva venta", href: "/nueva-venta" },
  { title: "Mis tickets", href: "/mis-tickets" },
  { title: "Mi turno", href: "/mi-turno" },
];

const ADMIN_NAV: NavItem[] = [
  { title: "Inicio", href: "/" },
  { title: "Productos", href: "/productos" },
  { title: "Movimientos", href: "/movimientos" },
  { title: "Mi turno", href: "/mi-turno" },
  { title: "Cajas", href: "/cierre-de-caja" },
  { title: "Reportes", href: "/reportes" },
  { title: "Administración", href: "/administracion" },
];

export function navItemsFor(role: NavRole): NavItem[] {
  return role === "cashier" ? CASHIER_NAV : ADMIN_NAV;
}

/** Role label as the legacy sidebar prints it ("Rol: cajero"). */
export const ROLE_LABELS: Record<NavRole, string> = { admin: "admin", cashier: "cajero", developer: "dev" };
