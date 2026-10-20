import { describe, expect, it } from "vitest";
import {
  MANAGEMENT_EXPORT_SHEET_NAMES,
  USERS_EXPORT_COLUMNS,
  buildManagementExportSheets,
  managementExportFileName,
  type ExportTable,
  type ManagementExportData,
} from "./management-export";

const table = (columns: string[], rows: Record<string, unknown>[] = []): ExportTable => ({ columns, rows });

function sampleData(over: Partial<ManagementExportData> = {}): ManagementExportData {
  return {
    movements: table(["id", "number"], [{ id: "a", number: 2 }, { id: "b", number: 1 }]),
    products: table(["id", "name"]),
    cashClosings: table(["id"]),
    categories: table(["id", "name"]),
    users: table(
      ["id", "username", "display_name", "role", "is_active", "created_at", "auth_user_id"],
      [{ id: "u1", username: "ana", display_name: "Ana", role: "admin", is_active: true, created_at: new Date("2026-10-19T21:33:12Z"), auth_user_id: "secret-auth-id" }],
    ),
    cashSessions: table(["id"]),
    cashEvents: table(["id", "detail"], [{ id: "e1", detail: { note: "x" } }]),
    passwordEvents: table(["id"]),
    recipes: table(["id"]),
    stockMovements: table(["id"]),
    ...over,
  };
}

describe("buildManagementExportSheets", () => {
  it("emits the 10 legacy sheets in the legacy order", () => {
    const names = buildManagementExportSheets(sampleData()).map((s) => s.name);
    expect(names).toEqual([
      "Movimientos", "Productos", "Cierres caja", "Categorias", "Usuarios", "Turnos caja",
      "Auditoria turnos", "Auditoria passwords", "Recetas", "Movimientos stock",
    ]);
    expect(names).toEqual([...MANAGEMENT_EXPORT_SHEET_NAMES]);
  });

  it("keeps the row order the reader produced and one cell per column", () => {
    const [movements] = buildManagementExportSheets(sampleData());
    expect(movements.columns).toEqual(["id", "number"]);
    expect(movements.rows).toEqual([["a", 2], ["b", 1]]);
  });

  it("keeps the header of an empty table", () => {
    const products = buildManagementExportSheets(sampleData())[1];
    expect(products.columns).toEqual(["id", "name"]);
    expect(products.rows).toEqual([]);
  });

  it("exports only the whitelisted user columns, never auth ids or secrets", () => {
    const users = buildManagementExportSheets(sampleData())[4];
    expect(users.columns).toEqual([...USERS_EXPORT_COLUMNS]);
    expect(users.columns).not.toContain("auth_user_id");
    expect(users.rows[0]).toEqual(["u1", "ana", "Ana", "admin", true, "2026-10-19 18:33:12"]);
  });

  it("whitelists users even when the reader returns extra columns that are missing from the rows", () => {
    const users = buildManagementExportSheets(sampleData({ users: table(["id", "username", "password_hash"], [{ id: "1", username: "x", password_hash: "h" }]) }))[4];
    expect(users.columns).toEqual([...USERS_EXPORT_COLUMNS]);
    expect(users.rows[0]).toEqual(["1", "x", null, null, null, null]);
  });

  it("renders timestamps in the business time zone, JSON as text and missing values as null", () => {
    const events = buildManagementExportSheets(sampleData())[6];
    expect(events.rows).toEqual([["e1", '{"note":"x"}']]);
    const sheet = buildManagementExportSheets(sampleData({ movements: table(["at", "none", "big"], [{ at: new Date("2026-01-02T03:04:05Z"), none: undefined, big: BigInt(12) }]) }))[0];
    expect(sheet.rows).toEqual([["2026-01-02 00:04:05", null, "12"]]);
  });
});

describe("managementExportFileName", () => {
  it("uses the legacy name with a business-time-zone timestamp (YYYYMMDD_HHMMSS)", () => {
    // 2026-10-20T01:02:03Z is still the 19th, 22:02:03 in Buenos Aires (UTC-3).
    expect(managementExportFileName(new Date("2026-10-20T01:02:03Z"))).toBe("export_gestion_cerveceria_20261019_220203.xlsx");
  });
});
