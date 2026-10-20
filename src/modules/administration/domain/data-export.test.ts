import { describe, expect, it } from "vitest";
import { buildDataExport, exportFileName, stripSecrets } from "./data-export";

describe("stripSecrets", () => {
  it("drops credential-like columns, whatever their casing", () => {
    expect(
      stripSecrets({ id: 1, username: "a", passwordHash: "x", password_hash: "x", encrypted_password: "x", apiKey: "k", refreshToken: "t", clientSecret: "s", authUserId: "u" }),
    ).toEqual({ id: 1, username: "a", authUserId: "u" });
  });

  it("keeps ordinary columns untouched", () => {
    const row = { id: "1", name: "Pinta", salePrice: 1200, active: true, createdAt: "2026-01-01" };
    expect(stripSecrets(row)).toEqual(row);
  });
});

describe("buildDataExport", () => {
  it("builds the documented shape and strips every table", () => {
    const result = buildDataExport({
      exportedAt: new Date("2026-10-20T15:00:00Z"),
      schemaVersion: "0005_password_events",
      tables: { users: [{ id: "1", password_hash: "x" }], products: [] },
    });
    expect(result).toEqual({
      exportedAt: "2026-10-20T15:00:00.000Z",
      schemaVersion: "0005_password_events",
      tables: { users: [{ id: "1" }], products: [] },
    });
  });
});

describe("exportFileName", () => {
  it("embeds the business date", () => {
    expect(exportFileName("2026-10-20")).toBe("chusetts-export-2026-10-20.json");
  });
});
