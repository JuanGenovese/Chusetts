import type { ExportSheet } from "../domain";

/**
 * Encodes the sheets as an .xlsx workbook (legacy: pandas + openpyxl). exceljs is imported lazily so it only loads when
 * a file is actually generated. Header row is bold; money and quantities are numeric cells.
 */
export async function encodeWorkbook(sheets: ExportSheet[]): Promise<Buffer> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    worksheet.addRow(sheet.columns).font = { bold: true };
    for (const row of sheet.rows) worksheet.addRow(row);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
