import type { AppRole } from "./username";

/** Legacy `auth.ROLE_PERMISSIONS`, verbatim (cajero -> cashier). */
export const ROLE_PERMISSIONS = {
  admin: new Set([
    "admin_access", "view_dashboard", "create_sale", "create_expense", "create_purchase", "adjust_stock", "edit_products",
    "view_reports", "view_all_movements", "annul_any_sale", "annul_any_movement", "close_cash", "manage_own_shift",
    "reopen_shift", "view_cash_admin", "manage_cash_movements",
  ]),
  cashier: new Set(["create_sale", "annul_own_sale", "view_cashier_home", "view_own_sales", "manage_own_shift"]),
} as const satisfies Record<AppRole, ReadonlySet<string>>;

export type Permission =
  | "admin_access" | "view_dashboard" | "create_sale" | "create_expense" | "create_purchase" | "adjust_stock" | "edit_products"
  | "view_reports" | "view_all_movements" | "annul_any_sale" | "annul_any_movement" | "close_cash" | "manage_own_shift"
  | "reopen_shift" | "view_cash_admin" | "manage_cash_movements" | "annul_own_sale" | "view_cashier_home" | "view_own_sales";

export const PERMISSION_DENIED_MESSAGE = "No tenés permisos para acceder a esta función.";

export function permissionsFor(role: AppRole): ReadonlySet<string> {
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(user: { role: AppRole }, permission: Permission): boolean {
  return permissionsFor(user.role).has(permission);
}

/**
 * Legacy `ensure_permission(...)` at the top of every page (app.py / ui/**). "/" is not listed: it renders the admin or
 * the cashier home depending on the role (admin_access / view_cashier_home).
 */
export const PAGE_PERMISSIONS = {
  "/productos": "edit_products",
  "/movimientos": "view_all_movements",
  "/mi-turno": "manage_own_shift",
  "/cierre-de-caja": "close_cash",
  "/reportes": "view_reports",
  "/administracion": "admin_access",
  "/nueva-venta": "create_sale",
  "/mis-tickets": "view_own_sales",
} as const satisfies Record<string, Permission>;
