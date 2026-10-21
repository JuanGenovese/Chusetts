import type { AppRole } from "./username";

/** Legacy `auth.ROLE_PERMISSIONS`, verbatim (cajero -> cashier). */
const ADMIN_PERMISSIONS = [
  "admin_access", "view_dashboard", "create_sale", "create_expense", "create_purchase", "adjust_stock", "edit_products",
  "view_reports", "view_all_movements", "annul_any_sale", "annul_any_movement", "close_cash", "manage_own_shift",
  "reopen_shift", "view_cash_admin", "manage_cash_movements",
] as const;

export const ROLE_PERMISSIONS = {
  admin: new Set<string>(ADMIN_PERMISSIONS),
  cashier: new Set<string>(["create_sale", "annul_own_sale", "view_cashier_home", "view_own_sales", "manage_own_shift"]),
  /** Everything an admin can do, plus the data export (the "backup"), which the business owner must not hold. */
  developer: new Set<string>([...ADMIN_PERMISSIONS, "export_data"]),
} as const satisfies Record<AppRole, ReadonlySet<string>>;

export type Permission =
  | "admin_access" | "view_dashboard" | "create_sale" | "create_expense" | "create_purchase" | "adjust_stock" | "edit_products"
  | "view_reports" | "view_all_movements" | "annul_any_sale" | "annul_any_movement" | "close_cash" | "manage_own_shift"
  | "reopen_shift" | "view_cash_admin" | "manage_cash_movements" | "export_data" | "annul_own_sale" | "view_cashier_home" | "view_own_sales";

export const PERMISSION_DENIED_MESSAGE = "No tenés permisos para acceder a esta función.";

export function permissionsFor(role: AppRole): ReadonlySet<string> {
  return ROLE_PERMISSIONS[role];
}

/** True for the roles that run the business side of the app (admin and developer); the developer is an admin plus extras. */
export function isAdminLike(role: AppRole): boolean {
  return role === "admin" || role === "developer";
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
