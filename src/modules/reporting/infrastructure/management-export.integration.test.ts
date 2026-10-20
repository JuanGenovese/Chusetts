import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalEnvironment } from "@/shared/infrastructure/auth/local-guard";
import { createDbConnection, requireDatabaseUrl, type DbConnection } from "@/shared/infrastructure/db/client";
import { passwordEvents, users } from "@/shared/infrastructure/db/schema";
import { MANAGEMENT_EXPORT_SHEET_NAMES, USERS_EXPORT_COLUMNS } from "../domain";
import { managementExportUseCases } from "../application";
import { createManagementExportReader } from "./drizzle-management-export";
import { encodeWorkbook } from "./xlsx-encoder";

/** LOCAL stack only (`supabase start`): real Postgres, read-only export. */
const tag = randomUUID().slice(0, 8);
let conn: DbConnection;

beforeAll(async () => {
  assertLocalEnvironment(process.env);
  conn = createDbConnection(requireDatabaseUrl(), { max: 2 });
  await conn.db.insert(users).values({ username: `it-export-${tag}`, displayName: "IT Export", role: "cashier" });
  await conn.db.insert(passwordEvents).values({ username: `it-export-${tag}`, type: "RESTABLECIMIENTO_ADMIN", performedBy: "it-admin" });
});

afterAll(async () => {
  await conn.db.delete(passwordEvents).where(eq(passwordEvents.username, `it-export-${tag}`));
  await conn.db.delete(users).where(eq(users.username, `it-export-${tag}`));
  await conn.close();
});

describe("management export against the local stack", () => {
  it("reads the ten sheets, whitelists users and orders newest first", async () => {
    const data = await createManagementExportReader(conn.db).readAll();
    expect(Object.keys(data)).toHaveLength(10);

    expect(data.users.columns).toEqual([...USERS_EXPORT_COLUMNS]);
    expect(data.users.rows.length).toBeGreaterThan(0);
    for (const row of data.users.rows) expect(Object.keys(row).sort()).toEqual([...USERS_EXPORT_COLUMNS].sort());
    expect(data.users.rows.map((r) => r.username)).toContain(`it-export-${tag}`);

    const passwordIds = data.passwordEvents.rows.map((r) => r.id as number);
    expect(passwordIds).toEqual([...passwordIds].sort((a, b) => b - a));
    expect(data.passwordEvents.columns).toEqual(["id", "username", "type", "performed_by", "occurred_at"]);

    const dates = data.movements.rows.map((r) => r.business_date as string);
    expect(dates).toEqual([...dates].sort().reverse());
    const sequences = data.stockMovements.rows.map((r) => r.sequence as number);
    expect(sequences).toEqual([...sequences].sort((a, b) => b - a));
    expect(data.cashClosings.rows.every((r) => r.status === "CLOSED")).toBe(true);
    expect(data.products.columns).toContain("stock_quantity");
    expect(data.recipes.columns).toEqual(expect.arrayContaining(["sale_product_name", "component_name", "component_stock_unit"]));
  });

  it("encodes an .xlsx that exceljs reads back with the ten sheets and a header row each", async () => {
    const { fileName, sheets } = await managementExportUseCases({
      reader: createManagementExportReader(conn.db),
      clock: { now: () => new Date("2026-10-20T18:05:09Z") },
    }).exportManagement();
    expect(fileName).toBe("export_gestion_cerveceria_20261020_150509.xlsx");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await encodeWorkbook(sheets)) as unknown as ArrayBuffer);
    expect(workbook.worksheets.map((w) => w.name)).toEqual([...MANAGEMENT_EXPORT_SHEET_NAMES]);
    workbook.worksheets.forEach((worksheet, index) => {
      const header = (worksheet.getRow(1).values as unknown[]).slice(1);
      expect(header).toEqual(sheets[index].columns);
      expect(worksheet.rowCount).toBe(sheets[index].rows.length + 1);
    });
    const usersSheet = workbook.getWorksheet("Usuarios")!;
    expect((usersSheet.getRow(1).values as unknown[]).slice(1)).toEqual([...USERS_EXPORT_COLUMNS]);
  });
});
