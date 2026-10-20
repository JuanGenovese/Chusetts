import { describe, expect, it } from "vitest";
import { assertSameProject, assertTargetMatchesUrl, isBcryptHash, planProvisioning, type LegacyAuthUser } from "./provisioning-plan";

const hash = "$2b$12$" + "a".repeat(53);
const legacy = (over: Partial<LegacyAuthUser> = {}): LegacyAuthUser => ({
  username: "admin", displayName: "Admin", role: "admin", active: true, passwordHash: hash, ...over,
});

describe("isBcryptHash", () => {
  it("accepts $2a/$2b/$2y with cost and 53 chars", () => {
    expect(isBcryptHash(hash)).toBe(true);
    expect(isBcryptHash("$2a$12$" + "b".repeat(53))).toBe(true);
    expect(isBcryptHash("$2y$10$" + "b".repeat(53))).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isBcryptHash("plaintext")).toBe(false);
    expect(isBcryptHash("$2b$12$short")).toBe(false);
    expect(isBcryptHash("")).toBe(false);
  });
});

describe("assertTargetMatchesUrl", () => {
  it("passes when --target equals the host of the Supabase URL", () => {
    expect(() => assertTargetMatchesUrl("abcd.supabase.co", "https://abcd.supabase.co")).not.toThrow();
    expect(() => assertTargetMatchesUrl("127.0.0.1:54321", "http://127.0.0.1:54321")).not.toThrow();
  });
  it("fails on a mismatch or a missing value", () => {
    expect(() => assertTargetMatchesUrl("other.supabase.co", "https://abcd.supabase.co")).toThrow(/target/i);
    expect(() => assertTargetMatchesUrl("", "https://abcd.supabase.co")).toThrow();
    expect(() => assertTargetMatchesUrl("abcd.supabase.co", "")).toThrow();
  });
});

describe("planProvisioning", () => {
  const appUsers = new Map([
    ["admin", { id: "u1", authUserId: null as string | null }],
    ["caja1", { id: "u2", authUserId: null as string | null }],
  ]);

  it("plans create-and-link for an active legacy user with an app row and no auth user", () => {
    const plan = planProvisioning([legacy()], { appUsers, authUserIdsByEmail: new Map() });
    expect(plan).toEqual([
      { username: "admin", email: "admin@users.chusetts.local", action: "create-and-link", appUserId: "u1" },
    ]);
  });
  it("normalizes usernames when matching", () => {
    const plan = planProvisioning([legacy({ username: " Admin " })], { appUsers, authUserIdsByEmail: new Map() });
    expect(plan[0]).toMatchObject({ username: "admin", action: "create-and-link" });
  });
  it("skips users that are already linked (idempotent)", () => {
    const linked = new Map([["admin", { id: "u1", authUserId: "a-1" }]]);
    const plan = planProvisioning([legacy()], { appUsers: linked, authUserIdsByEmail: new Map() });
    expect(plan[0]).toMatchObject({ action: "skip-already-linked" });
  });
  it("links an existing auth user (crash between create and link)", () => {
    const plan = planProvisioning([legacy()], {
      appUsers,
      authUserIdsByEmail: new Map([["admin@users.chusetts.local", "a-9"]]),
    });
    expect(plan[0]).toMatchObject({ action: "link-existing", authUserId: "a-9" });
  });
  it("skips inactive legacy users", () => {
    const plan = planProvisioning([legacy({ active: false })], { appUsers, authUserIdsByEmail: new Map() });
    expect(plan[0]).toMatchObject({ action: "skip-inactive" });
  });
  it("reports an error when the app row is missing", () => {
    const plan = planProvisioning([legacy({ username: "ghost" })], { appUsers, authUserIdsByEmail: new Map() });
    expect(plan[0]).toMatchObject({ action: "error-missing-app-user" });
  });
  it("reports an error for an invalid hash and never echoes it", () => {
    const plan = planProvisioning([legacy({ passwordHash: "nope" })], { appUsers, authUserIdsByEmail: new Map() });
    expect(plan[0]).toMatchObject({ action: "error-invalid-hash" });
    expect(JSON.stringify(plan)).not.toContain("nope");
  });
  it("does not require a valid hash to skip an already linked user", () => {
    const linked = new Map([["admin", { id: "u1", authUserId: "a-1" }]]);
    const plan = planProvisioning([legacy({ passwordHash: "" })], { appUsers: linked, authUserIdsByEmail: new Map() });
    expect(plan[0]).toMatchObject({ action: "skip-already-linked" });
  });
});


describe("assertSameProject (the database must belong to the same Supabase project as the Auth API)", () => {
  it("accepts a local database with a local stack", () => {
    expect(() => assertSameProject("postgresql://postgres:postgres@127.0.0.1:54322/postgres", "http://127.0.0.1:54321")).not.toThrow();
  });
  it("accepts a hosted direct connection or a pooler user carrying the project ref", () => {
    expect(() => assertSameProject("postgresql://postgres:x@db.abcd.supabase.co:5432/postgres", "https://abcd.supabase.co")).not.toThrow();
    expect(() => assertSameProject("postgresql://postgres.abcd:x@aws-0-sa-east-1.pooler.supabase.com:6543/postgres", "https://abcd.supabase.co")).not.toThrow();
  });
  it("rejects mixed local/remote and different projects", () => {
    expect(() => assertSameProject("postgresql://u:p@127.0.0.1:54322/postgres", "https://abcd.supabase.co")).toThrow();
    expect(() => assertSameProject("postgresql://postgres:p@db.zzzz.supabase.co:5432/postgres", "https://abcd.supabase.co")).toThrow();
    expect(() => assertSameProject("postgresql://u:p@db.abcd.supabase.co/postgres", "http://127.0.0.1:54321")).toThrow();
  });
  it("never echoes credentials", () => {
    try {
      assertSameProject("postgresql://postgres:topsecret@db.zzzz.supabase.co:5432/postgres", "https://abcd.supabase.co");
    } catch (e) {
      expect(String(e)).not.toContain("topsecret");
    }
  });
});
