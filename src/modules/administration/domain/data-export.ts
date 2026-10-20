/** Columns whose name looks like a credential never leave the system in an export (hashes, tokens, keys, secrets). */
const SECRET_COLUMN = /password|passwd|hash|secret|token|credential|api[_-]?key/i;

export type ExportRow = Record<string, unknown>;

export interface DataExport {
  /** ISO 8601, UTC. */
  exportedAt: string;
  /** Tag of the latest applied migration, e.g. "0005_password_events". */
  schemaVersion: string;
  tables: Record<string, ExportRow[]>;
}

export function stripSecrets(row: ExportRow): ExportRow {
  return Object.fromEntries(Object.entries(row).filter(([column]) => !SECRET_COLUMN.test(column)));
}

export function buildDataExport(input: { exportedAt: Date; schemaVersion: string; tables: Record<string, ExportRow[]> }): DataExport {
  return {
    exportedAt: input.exportedAt.toISOString(),
    schemaVersion: input.schemaVersion,
    tables: Object.fromEntries(Object.entries(input.tables).map(([name, rows]) => [name, rows.map(stripSecrets)])),
  };
}

export function exportFileName(businessDate: string): string {
  return `chusetts-export-${businessDate}.json`;
}
