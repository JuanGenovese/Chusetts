import { describe, expect, it } from "vitest";
import { loginWithPassword, resolveSessionUser } from "./login";
import type { AppUserRecord, PasswordAuthenticator, UserDirectory } from "./ports";

const admin: AppUserRecord = { id: "u1", username: "admin", displayName: "Admin", role: "admin", isActive: true, authUserId: "a1" };

function fakes(users: AppUserRecord[], credentials: Record<string, { password: string; authUserId: string }>) {
  const log: string[] = [];
  const directory: UserDirectory = {
    findByUsername: async (u) => users.find((x) => x.username === u) ?? null,
    findByAuthUserId: async (id) => users.find((x) => x.authUserId === id) ?? null,
    countUsers: async () => users.length,
  };
  const authenticator: PasswordAuthenticator = {
    signIn: async (email, password) => {
      log.push(`signIn:${email}`);
      const c = credentials[email];
      return c && c.password === password ? { authUserId: c.authUserId } : null;
    },
    signOut: async () => {
      log.push("signOut");
    },
  };
  return { deps: { directory, authenticator }, log };
}
const creds = { "admin@users.chusetts.local": { password: "secret-pass", authUserId: "a1" } };

describe("loginWithPassword", () => {
  it("logs in with username (trimmed + lowercased) and password", async () => {
    const { deps, log } = fakes([admin], creds);
    const result = await loginWithPassword(deps)({ username: "  ADMIN ", password: "secret-pass" });
    expect(result).toEqual({ ok: true, authUserId: "a1", user: { id: "u1", username: "admin", displayName: "Admin", role: "admin" } });
    expect(log).toEqual(["signIn:admin@users.chusetts.local"]);
  });
  it("returns the generic legacy error on a wrong password", async () => {
    const { deps } = fakes([admin], creds);
    expect(await loginWithPassword(deps)({ username: "admin", password: "nope" })).toEqual({
      ok: false, message: "Usuario o contraseña incorrectos.",
    });
  });
  it("returns the same error for an unknown user (no enumeration) and still attempts a sign-in", async () => {
    const { deps, log } = fakes([admin], creds);
    const result = await loginWithPassword(deps)({ username: "ghost", password: "whatever1" });
    expect(result).toEqual({ ok: false, message: "Usuario o contraseña incorrectos." });
    expect(log).toEqual(["signIn:ghost@users.chusetts.local"]);
  });
  it("rejects an inactive user even with a valid password and closes the auth session", async () => {
    const { deps, log } = fakes([{ ...admin, isActive: false }], creds);
    const result = await loginWithPassword(deps)({ username: "admin", password: "secret-pass" });
    expect(result).toEqual({ ok: false, message: "Usuario o contraseña incorrectos." });
    expect(log).toContain("signOut");
  });
  it("rejects when the auth user is not the one linked to the app user", async () => {
    const { deps, log } = fakes([{ ...admin, authUserId: "other" }], creds);
    expect((await loginWithPassword(deps)({ username: "admin", password: "secret-pass" })).ok).toBe(false);
    expect(log).toContain("signOut");
  });
  it("rejects when the app user is not linked yet", async () => {
    const { deps } = fakes([{ ...admin, authUserId: null }], creds);
    expect((await loginWithPassword(deps)({ username: "admin", password: "secret-pass" })).ok).toBe(false);
  });
  it("rejects empty fields without calling the auth provider", async () => {
    const { deps, log } = fakes([admin], creds);
    expect((await loginWithPassword(deps)({ username: "  ", password: "" })).ok).toBe(false);
    expect(log).toEqual([]);
  });
});

describe("resolveSessionUser", () => {
  it("returns the active linked user", async () => {
    const { deps } = fakes([admin], creds);
    expect(await resolveSessionUser(deps.directory)("a1")).toEqual({ id: "u1", username: "admin", displayName: "Admin", role: "admin" });
  });
  it("returns null for inactive or unknown identities", async () => {
    const { deps } = fakes([{ ...admin, isActive: false }], creds);
    expect(await resolveSessionUser(deps.directory)("a1")).toBeNull();
    expect(await resolveSessionUser(deps.directory)("zzz")).toBeNull();
  });
});
