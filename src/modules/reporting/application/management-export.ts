import { buildManagementExportSheets, managementExportFileName, type ExportSheet } from "../domain";
import type { ManagementExportDeps } from "./ports/management-export";

/** Legacy `export_movimientos_excel`: the file name and the ten sheets (the .xlsx encoding is infrastructure). */
export function managementExportUseCases(deps: ManagementExportDeps) {
  return {
    async exportManagement(): Promise<{ fileName: string; sheets: ExportSheet[] }> {
      const data = await deps.reader.readAll();
      return { fileName: managementExportFileName(deps.clock.now()), sheets: buildManagementExportSheets(data) };
    },
  };
}
