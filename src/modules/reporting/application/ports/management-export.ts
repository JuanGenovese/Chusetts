import type { ManagementExportData } from "../../domain";

/**
 * Reads every table of the "Exportar gestión a Excel" workbook as ONE consistent snapshot. It is not part of the
 * reporting unit of work: the adapter opens its own read-only REPEATABLE READ transaction.
 */
export interface ManagementExportReader {
  readAll(): Promise<ManagementExportData>;
}

export interface ManagementExportDeps {
  reader: ManagementExportReader;
  clock: { now(): Date };
}
