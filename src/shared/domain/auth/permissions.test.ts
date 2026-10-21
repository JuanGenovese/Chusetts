import { describe, expect, it } from "vitest";
import { PAGE_PERMISSIONS, ROLE_PERMISSIONS, hasPermission, isAdminLike, permissionsFor } from "./permissions";

describe("ROLE_PERMISSIONS (legacy auth.ROLE_PERMISSIONS, verbatim)", () => {
  it("gives the admin the legacy admin set", () => {
    expect([...permissionsFor("admin")].sort()).toEqual(
      [
        "admin_access", "view_dashboard", "create_sale", "create_expense", "create_purchase", "adjust_stock", "edit_products",
        "view_reports", "view_all_movements", "annul_any_sale", "annul_any_movement", "close_cash", "manage_own_shift",
        "reopen_shift", "view_cash_admin", "manage_cash_movements",
      ].sort(),
    );
  });
  it("gives the cashier the legacy cajero set", () => {
    expect([...permissionsFor("cashier")].sort()).toEqual(
      ["create_sale", "annul_own_sale", "view_cashier_home", "view_own_sales", "manage_own_shift"].sort(),
    );
  });
  it("keeps the sets disjoint where the legacy does", () => {
    expect(hasPermission({ role: "admin" }, "view_cashier_home")).toBe(false);
    expect(hasPermission({ role: "cashier" }, "admin_access")).toBe(false);
    expect(hasPermission({ role: "cashier" }, "close_cash")).toBe(false);
    expect(hasPermission({ role: "cashier" }, "view_reports")).toBe(false);
    expect(hasPermission({ role: "admin" }, "annul_own_sale")).toBe(false);
  });
  it("is exposed as a readonly map", () => {
    expect(Object.keys(ROLE_PERMISSIONS)).toEqual(["admin", "cashier", "developer"]);
  });
  it("gives the developer every admin permission plus export_data", () => {
    const admin = [...permissionsFor("admin")];
    expect([...permissionsFor("developer")].sort()).toEqual([...admin, "export_data"].sort());
  });
  it("keeps export_data away from the admin and the cashier", () => {
    expect(hasPermission({ role: "admin" }, "export_data")).toBe(false);
    expect(hasPermission({ role: "cashier" }, "export_data")).toBe(false);
    expect(hasPermission({ role: "developer" }, "export_data")).toBe(true);
  });
});

describe("isAdminLike", () => {
  it("is true for admin and developer, false for cashier", () => {
    expect([isAdminLike("admin"), isAdminLike("developer"), isAdminLike("cashier")]).toEqual([true, true, false]);
  });
});

describe("PAGE_PERMISSIONS (legacy ensure_permission per page)", () => {
  it("maps every gated route", () => {
    expect(PAGE_PERMISSIONS).toEqual({
      "/productos": "edit_products",
      "/movimientos": "view_all_movements",
      "/mi-turno": "manage_own_shift",
      "/cierre-de-caja": "close_cash",
      "/reportes": "view_reports",
      "/administracion": "admin_access",
      "/nueva-venta": "create_sale",
      "/mis-tickets": "view_own_sales",
    });
  });
});
