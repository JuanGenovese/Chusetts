import { describe, expect, it } from "vitest";
import type { ExportTable, ManagementExportData } from "../domain";
import { managementExportUseCases } from "./management-export";

const empty = (columns: string[] = ["id"]): ExportTable => ({ columns, rows: [] });

describe("managementExportUseCases", () => {
  it("names the file after the clock and returns the ten sheets", async () => {
    const data: ManagementExportData = {
      movements: empty(), products: empty(), cashClosings: empty(), categories: empty(), users: empty(["id", "username", "auth_user_id"]),
      cashSessions: empty(), cashEvents: empty(), passwordEvents: empty(), recipes: empty(), stockMovements: empty(),
    };
    let reads = 0;
    const cases = managementExportUseCases({
      reader: { readAll: async () => (reads++, data) },
      clock: { now: () => new Date("2026-10-20T18:05:09Z") },
    });
    const result = await cases.exportManagement();
    expect(reads).toBe(1);
    expect(result.fileName).toBe("export_gestion_cerveceria_20261020_150509.xlsx");
    expect(result.sheets).toHaveLength(10);
    expect(result.sheets[4].columns).not.toContain("auth_user_id");
  });
});
