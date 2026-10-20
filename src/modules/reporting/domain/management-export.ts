import { formatTimestamp } from "@/shared/domain/datetime";

/** One table as read from the database: DB column names (like the legacy `SELECT *`) and rows keyed by them. */
export interface ExportTable {
  columns: string[];
  rows: Record<string, unknown>[];
}

/** Legacy sources of the workbook, one per sheet. Rows arrive already ordered (each sheet keeps its legacy ORDER BY). */
export interface ManagementExportData {
  movements: ExportTable;
  products: ExportTable;
  /** Closed cash sessions: in the new schema the day closing lives in `cash_sessions` (expected / counted / difference). */
  cashClosings: ExportTable;
  categories: ExportTable;
  users: ExportTable;
  cashSessions: ExportTable;
  cashEvents: ExportTable;
  passwordEvents: ExportTable;
  recipes: ExportTable;
  stockMovements: ExportTable;
}

export type ExportCell = string | number | boolean | null;

/** Format-agnostic sheet: encoding it as .xlsx is an infrastructure concern. */
export interface ExportSheet {
  name: string;
  columns: string[];
  rows: ExportCell[][];
}

/** Legacy sheet names, in legacy order. */
export const MANAGEMENT_EXPORT_SHEET_NAMES = [
  "Movimientos",
  "Productos",
  "Cierres caja",
  "Categorias",
  "Usuarios",
  "Turnos caja",
  "Auditoria turnos",
  "Auditoria passwords",
  "Recetas",
  "Movimientos stock",
] as const;

/** Legacy `SELECT id, username, display_name, role, is_active, created_at FROM users`: nothing else is ever exported. */
export const USERS_EXPORT_COLUMNS = ["id", "username", "display_name", "role", "is_active", "created_at"] as const;

function toCell(value: unknown): ExportCell {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : formatTimestamp(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

function toSheet(name: string, table: ExportTable, columns: readonly string[] = table.columns): ExportSheet {
  return { name, columns: [...columns], rows: table.rows.map((row) => columns.map((column) => toCell(row[column]))) };
}

/** Pure: arranges the ten tables into the legacy workbook layout. */
export function buildManagementExportSheets(data: ManagementExportData): ExportSheet[] {
  const [movements, products, closings, categories, users, sessions, events, passwords, recipes, stock] = MANAGEMENT_EXPORT_SHEET_NAMES;
  return [
    toSheet(movements, data.movements),
    toSheet(products, data.products),
    toSheet(closings, data.cashClosings),
    toSheet(categories, data.categories),
    toSheet(users, data.users, USERS_EXPORT_COLUMNS),
    toSheet(sessions, data.cashSessions),
    toSheet(events, data.cashEvents),
    toSheet(passwords, data.passwordEvents),
    toSheet(recipes, data.recipes),
    toSheet(stock, data.stockMovements),
  ];
}

/** Legacy `export_gestion_cerveceria_%Y%m%d_%H%M%S.xlsx`, with the timestamp in the business time zone. */
export function managementExportFileName(now: Date): string {
  const [date, time] = formatTimestamp(now).split(" ");
  return `export_gestion_cerveceria_${date.replaceAll("-", "")}_${time.replaceAll(":", "")}.xlsx`;
}
