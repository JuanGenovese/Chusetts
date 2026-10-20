import type { ReactNode } from "react";

export interface SummaryTableProps {
  headers: string[];
  rows: ReactNode[][];
  /** Zero-based indexes of right-aligned numeric columns. */
  numericColumns?: number[];
}

/** Legacy `light_table`: bordered card with a tinted header row. Rows must have stable content keys. */
export function SummaryTable({ headers, rows, numericColumns = [] }: SummaryTableProps) {
  const numeric = new Set(numericColumns);
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c} className={numeric.has(c) ? "num" : undefined}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
