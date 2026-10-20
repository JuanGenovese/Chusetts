import { describe, expect, it } from "vitest";
import { administrationUseCases } from "./use-cases";
import { InMemoryAdministration } from "./testing/in-memory";

const input = { username: " Caja1 ", displayName: "Caja Uno", role: "cajero", password: "12345678", passwordRepeat: "12345678" };

function setup() {
  const store = new InMemoryAdministration();
  const admin = store.addUser({ username: "admin", role: "admin", displayName: "Admin" });
  return { store, admin, cases: administrationUseCases(store.deps()) };
}

describe("createUser", () => {
  it("creates the auth account first, then the linked users row", async () => {
    const { store, cases } = setup();
    const created = await cases.createUser(input);
    expect(created).toEqual({ username: "caja1" });
    expect(store.calls).toEqual(["auth:create:caja1@users.chusetts.local", "db:insert:caja1"]);
    expect(store.users.find((u) => u.username === "caja1")).toMatchObject({ role: "cashier", displayName: "Caja Uno", authUserId: "a-1" });
  });

  it("refuses an existing username before touching the identity provider", async () => {
    const { store, cases } = setup();
    await expect(cases.createUser({ ...input, username: "Admin" })).rejects.toThrow("Ese nombre de usuario ya existe.");
    expect(store.calls).toEqual([]);
  });

  it("validates before any side effect", async () => {
    const { store, cases } = setup();
    await expect(cases.createUser({ ...input, passwordRepeat: "nope" })).rejects.toThrow("Las contraseñas no coinciden.");
    await expect(cases.createUser({ ...input, password: "short", passwordRepeat: "short" })).rejects.toThrow("al menos 8 caracteres");
    expect(store.calls).toEqual([]);
  });

  it("deletes the auth account when the users insert fails and rethrows the original error", async () => {
    const { store, cases } = setup();
    store.failInsertWith = new Error("db down");
    await expect(cases.createUser(input)).rejects.toThrow("db down");
    expect(store.calls).toEqual(["auth:create:caja1@users.chusetts.local", "db:insert:caja1", "auth:delete:a-1"]);
    expect(store.authAccounts.has("a-1")).toBe(false);
  });

  it("does not mask the insert error when the compensation fails too", async () => {
    const { store, cases } = setup();
    store.failInsertWith = new Error("db down");
    store.failDeleteWith = new Error("auth down");
    await expect(cases.createUser(input)).rejects.toThrow("db down");
  });

  it("does not record a password event (legacy only audits resets)", async () => {
    const { store, cases } = setup();
    await cases.createUser(input);
    expect(store.events).toEqual([]);
  });
});

describe("resetPassword", () => {
  const reset = { targetUsername: " Caja1 ", newPassword: "temporal-1", actorUsername: "Admin" };

  it("changes the password and records RESTABLECIMIENTO_ADMIN with the actor and the clock", async () => {
    const { store, cases } = setup();
    const target = store.addUser({ username: "caja1" });
    await cases.resetPassword(reset);
    expect(store.authAccounts.get(target.authUserId!)?.password).toBe("temporal-1");
    expect(store.events).toEqual([
      { username: "caja1", type: "RESTABLECIMIENTO_ADMIN", performedBy: "admin", occurredAt: new Date("2026-10-20T15:00:00Z") },
    ]);
    expect(store.calls).toEqual([`auth:set-password:${target.authUserId}`, "event:RESTABLECIMIENTO_ADMIN:caja1"]);
  });

  it("validates the password first (legacy order)", async () => {
    const { store, cases } = setup();
    await expect(cases.resetPassword({ ...reset, newPassword: "corta", actorUsername: "nadie" })).rejects.toThrow("al menos 8 caracteres");
    expect(store.calls).toEqual([]);
  });

  it("only an active admin may reset", async () => {
    const { store, cases } = setup();
    store.addUser({ username: "caja1" });
    store.addUser({ username: "caja2" });
    store.addUser({ username: "off", role: "admin", isActive: false });
    for (const actorUsername of ["caja2", "off", "ghost"]) {
      await expect(cases.resetPassword({ ...reset, actorUsername })).rejects.toThrow("Solo un administrador activo puede restablecer contraseñas.");
    }
    expect(store.calls).toEqual([]);
  });

  it("reports a missing target", async () => {
    const { store, cases } = setup();
    await expect(cases.resetPassword(reset)).rejects.toThrow("El usuario seleccionado no existe.");
    expect(store.events).toEqual([]);
  });

  it("refuses a user without a linked auth account and records nothing", async () => {
    const { store, cases } = setup();
    store.addUser({ username: "caja1", authUserId: null });
    await expect(cases.resetPassword(reset)).rejects.toThrow("no tiene una cuenta de acceso");
    expect(store.events).toEqual([]);
  });

  it("records no event when the identity provider rejects the change", async () => {
    const { store, cases } = setup();
    store.addUser({ username: "caja1", authUserId: "a-missing" });
    store.authAccounts.delete("a-missing");
    await expect(cases.resetPassword(reset)).rejects.toThrow();
    expect(store.events).toEqual([]);
  });

  it("lets an admin reset their own password", async () => {
    const { store, cases } = setup();
    await cases.resetPassword({ targetUsername: "admin", newPassword: "temporal-1", actorUsername: "admin" });
    expect(store.events[0]).toMatchObject({ username: "admin", performedBy: "admin" });
  });
});

describe("listing", () => {
  it("lists users ordered by username and the audit newest first, limited to 100", async () => {
    const { store, cases } = setup();
    store.addUser({ username: "zeta" });
    store.addUser({ username: "beta" });
    expect((await cases.listUsers()).map((u) => u.username)).toEqual(["admin", "beta", "zeta"]);
    for (let i = 0; i < 105; i += 1) {
      store.events.push({ username: `u${i}`, type: "RESTABLECIMIENTO_ADMIN", performedBy: "admin", occurredAt: new Date(2026, 0, 1, 0, i) });
    }
    const events = await cases.listPasswordEvents();
    expect(events).toHaveLength(100);
    expect(events[0].username).toBe("u104");
  });
});

describe("exportData", () => {
  it("strips secrets, names the file after the business date and stamps the clock", async () => {
    const { store, cases } = setup();
    store.tables = { users: [{ id: "1", username: "a", password_hash: "SECRET" }], products: [] };
    const result = await cases.exportData();
    expect(result.fileName).toBe("chusetts-export-2026-10-20.json");
    expect(result.data).toEqual({
      exportedAt: "2026-10-20T15:00:00.000Z",
      schemaVersion: "0005_password_events",
      tables: { users: [{ id: "1", username: "a" }], products: [] },
    });
    expect(JSON.stringify(result.data)).not.toContain("SECRET");
  });
});
