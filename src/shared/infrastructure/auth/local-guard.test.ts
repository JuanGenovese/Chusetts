import { describe, expect, it } from "vitest";
import { assertLocalEnvironment, isLocalUrl } from "./local-guard";

describe("isLocalUrl", () => {
  it("accepts loopback hosts only", () => {
    expect(isLocalUrl("postgresql://postgres:postgres@127.0.0.1:54322/postgres")).toBe(true);
    expect(isLocalUrl("http://localhost:54321")).toBe(true);
    expect(isLocalUrl("http://[::1]:54321")).toBe(true);
    expect(isLocalUrl("https://abcd.supabase.co")).toBe(false);
    expect(isLocalUrl("postgresql://u:p@db.abcd.supabase.co:5432/postgres")).toBe(false);
    expect(isLocalUrl("http://127.0.0.1.evil.com")).toBe(false);
    expect(isLocalUrl("not a url")).toBe(false);
    expect(isLocalUrl(undefined)).toBe(false);
  });
});

describe("assertLocalEnvironment", () => {
  it("passes for a fully local environment", () => {
    expect(() =>
      assertLocalEnvironment({ DATABASE_URL: "postgresql://x:y@localhost:54322/postgres", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }),
    ).not.toThrow();
  });
  it("fails when either side is remote, without echoing the URL", () => {
    expect(() => assertLocalEnvironment({ DATABASE_URL: "postgresql://x:secretpw@db.abcd.supabase.co/postgres", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" })).toThrow(/DATABASE_URL/);
    try {
      assertLocalEnvironment({ DATABASE_URL: "postgresql://x:secretpw@db.abcd.supabase.co/postgres", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" });
    } catch (e) {
      expect(String(e)).not.toContain("secretpw");
    }
    expect(() => assertLocalEnvironment({ DATABASE_URL: "postgresql://x:y@127.0.0.1/db", NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co" })).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
