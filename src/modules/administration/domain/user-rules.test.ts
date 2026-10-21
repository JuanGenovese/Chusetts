import { describe, expect, it } from "vitest";
import { DomainError } from "@/shared/domain/errors";
import { assertCanResetPasswordOf, assertCanResetPasswords, prepareNewUser, roleLabel } from "./user-rules";

const valid = { username: "  Caja1 ", displayName: "  Caja Uno ", role: "cajero", password: "12345678", passwordRepeat: "12345678" };

const errorOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error as DomainError;
  }
  return null;
};

describe("prepareNewUser (legacy create_user)", () => {
  it("normalizes the username (strip + lower), trims the display name and maps the legacy role", () => {
    expect(prepareNewUser(valid)).toEqual({
      username: "caja1",
      displayName: "Caja Uno",
      role: "cashier",
      authEmail: "caja1@users.chusetts.local",
      password: "12345678",
    });
  });

  it("falls back to the username when the display name is blank", () => {
    expect(prepareNewUser({ ...valid, displayName: "   " }).displayName).toBe("caja1");
  });

  it("accepts the admin role", () => {
    expect(prepareNewUser({ ...valid, role: " Admin " }).role).toBe("admin");
  });

  it("rejects different passwords with the legacy copy, before anything else", () => {
    const error = errorOf(() => prepareNewUser({ ...valid, role: "root", passwordRepeat: "other" }));
    expect(error?.message).toBe("Las contraseñas no coinciden.");
  });

  it("rejects an unknown role", () => {
    expect(errorOf(() => prepareNewUser({ ...valid, role: "root" }))?.message).toBe("Rol inválido. Debe ser admin o cajero.");
  });

  it("rejects a password shorter than 8 characters", () => {
    const error = errorOf(() => prepareNewUser({ ...valid, password: "1234567", passwordRepeat: "1234567" }));
    expect(error?.message).toBe("La contraseña debe tener al menos 8 caracteres.");
  });

  it("rejects an empty username", () => {
    expect(errorOf(() => prepareNewUser({ ...valid, username: "   " }))?.message).toBe("El nombre de usuario es obligatorio.");
  });
});

describe("assertCanResetPasswords (legacy reset_user_password)", () => {
  it("allows an active admin", () => {
    expect(() => assertCanResetPasswords({ role: "admin", isActive: true })).not.toThrow();
  });

  it("allows an active developer", () => {
    expect(() => assertCanResetPasswords({ role: "developer", isActive: true })).not.toThrow();
  });

  it.each([
    ["a cashier", { role: "cashier" as const, isActive: true }],
    ["an inactive admin", { role: "admin" as const, isActive: false }],
    ["an unknown actor", null],
  ])("refuses %s", (_label, actor) => {
    expect(errorOf(() => assertCanResetPasswords(actor))?.message).toBe("Solo un administrador activo puede restablecer contraseñas.");
  });
});

describe("assertCanResetPasswordOf (no escalation into developer accounts)", () => {
  it("refuses an admin resetting a developer", () => {
    expect(errorOf(() => assertCanResetPasswordOf("admin", "developer"))?.message).toBe(
      "No podés restablecer la contraseña de una cuenta de desarrollador.",
    );
  });

  it.each([
    ["admin", "admin"],
    ["admin", "cashier"],
    ["developer", "admin"],
    ["developer", "cashier"],
    ["developer", "developer"],
  ] as const)("allows %s resetting %s", (actor, target) => {
    expect(() => assertCanResetPasswordOf(actor, target)).not.toThrow();
  });
});

describe("roleLabel", () => {
  it("shows the legacy role names", () => {
    expect([roleLabel("admin"), roleLabel("cashier"), roleLabel("developer")]).toEqual(["admin", "cajero", "dev"]);
  });
});
