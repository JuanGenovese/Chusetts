import { describe, expect, it } from "vitest";
import {
  LOGIN_ERROR_MESSAGE,
  MIN_PASSWORD_LENGTH,
  legacyRoleToRole,
  normalizeUsername,
  usernameToAuthEmail,
  validatePassword,
} from "./username";

describe("normalizeUsername (legacy auth.authenticate: strip + lower)", () => {
  it("trims and lowercases", () => {
    expect(normalizeUsername("  Admin  ")).toBe("admin");
    expect(normalizeUsername("CAJA1")).toBe("caja1");
  });
  it("keeps inner characters", () => {
    expect(normalizeUsername("Juan Perez")).toBe("juan perez");
  });
});

describe("usernameToAuthEmail", () => {
  it("maps a plain username to the internal synthetic domain", () => {
    expect(usernameToAuthEmail("Admin")).toBe("admin@users.chusetts.local");
    expect(usernameToAuthEmail(" caja1 ")).toBe("caja1@users.chusetts.local");
  });
  it("is deterministic and case/space insensitive", () => {
    expect(usernameToAuthEmail("ADMIN ")).toBe(usernameToAuthEmail("admin"));
  });
  it("hex-encodes usernames that are not valid e-mail local parts", () => {
    const email = usernameToAuthEmail("juan perez");
    expect(email).toMatch(/^hex-[0-9a-f]+@users\.chusetts\.local$/);
    expect(email).toBe("hex-6a75616e20706572657a@users.chusetts.local");
  });
  it("never collides between an encoded and a plain username", () => {
    expect(usernameToAuthEmail("hex-6a75616e20706572657a")).not.toBe(usernameToAuthEmail("juan perez"));
  });
  it("rejects an empty username", () => {
    expect(() => usernameToAuthEmail("   ")).toThrow();
  });
});

describe("validatePassword (legacy auth.validate_password)", () => {
  it("requires at least 8 characters with the legacy message", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(() => validatePassword("1234567")).toThrow("La contraseña debe tener al menos 8 caracteres.");
    expect(() => validatePassword("12345678")).not.toThrow();
  });
});

describe("legacyRoleToRole", () => {
  it("maps cajero to cashier and keeps admin", () => {
    expect(legacyRoleToRole("cajero")).toBe("cashier");
    expect(legacyRoleToRole(" Admin ")).toBe("admin");
  });
  it("rejects unknown roles", () => {
    expect(() => legacyRoleToRole("root")).toThrow();
  });
});

describe("messages", () => {
  it("uses the legacy login error verbatim", () => {
    expect(LOGIN_ERROR_MESSAGE).toBe("Usuario o contraseña incorrectos.");
  });
});
