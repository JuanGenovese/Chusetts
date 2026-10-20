import { describe, expect, it } from "vitest";
import { hasPermission } from "./permissions";

describe("hasPermission (legacy ROLE_PERMISSIONS, re-exported from the shared domain)", () => {
  it("lets the admin into the admin home and the cashier into the cashier home only", () => {
    expect(hasPermission({ role: "admin" }, "admin_access")).toBe(true);
    expect(hasPermission({ role: "admin" }, "view_cashier_home")).toBe(false);
    expect(hasPermission({ role: "cashier" }, "view_cashier_home")).toBe(true);
    expect(hasPermission({ role: "cashier" }, "admin_access")).toBe(false);
    expect(hasPermission({ role: "cashier" }, "edit_products")).toBe(false);
  });
});
