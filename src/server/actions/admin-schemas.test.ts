import { describe, expect, it } from "vitest";
import { createUserSchema, resetPasswordSchema } from "./admin-schemas";

const message = (result: { success: false; error: { issues: { message: string }[] } } | { success: true }) =>
  result.success ? null : result.error.issues[0].message;

describe("createUserSchema", () => {
  const valid = { username: " Caja1 ", displayName: "Caja", role: "cajero", password: " 12345678 ", passwordRepeat: " 12345678 " };

  it("passes the raw values through (the domain normalizes) and never trims passwords", () => {
    expect(createUserSchema.parse(valid)).toEqual(valid);
  });

  it("defaults a missing display name to empty (the domain falls back to the username)", () => {
    expect(createUserSchema.parse({ ...valid, displayName: undefined }).displayName).toBe("");
  });

  it("rejects an unknown role with the legacy copy", () => {
    expect(message(createUserSchema.safeParse({ ...valid, role: "root" }))).toBe("Rol inválido. Debe ser admin o cajero.");
  });

  it("rejects missing or non-string fields", () => {
    expect(createUserSchema.safeParse({ ...valid, username: undefined }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...valid, password: 12345678 }).success).toBe(false);
  });

  it("bounds the field sizes", () => {
    expect(createUserSchema.safeParse({ ...valid, username: "a".repeat(200) }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...valid, password: "a".repeat(1000), passwordRepeat: "a".repeat(1000) }).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  const valid = { username: "caja1", newPassword: "temporal-1", newPasswordRepeat: "temporal-1" };

  it("accepts matching passwords", () => {
    expect(resetPasswordSchema.parse(valid)).toEqual(valid);
  });

  it("rejects different passwords with the legacy copy", () => {
    expect(message(resetPasswordSchema.safeParse({ ...valid, newPasswordRepeat: "otra" }))).toBe("Las contraseñas no coinciden.");
  });

  it("requires a selected user", () => {
    expect(message(resetPasswordSchema.safeParse({ ...valid, username: "" }))).toBe("El usuario seleccionado no existe.");
  });
});
