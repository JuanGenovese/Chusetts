import { formatG } from "@/shared/domain/quantity";
import { formatMoney } from "@/shared/domain/money";
import type { RecordItem } from "@/shared/ui";
import type { ReportMovement, StockReportRow } from "../domain";

const present = (value: string | null | undefined): value is string => value !== null && value !== undefined && value !== "";

/** Legacy `record_list`: only fields with a value are shown, subtitle parts are joined with " · ". */
function visibleFields(fields: [string, string | null | undefined][]): RecordItem["fields"] {
  return fields.filter((f): f is [string, string] => present(f[1])).map(([label, value]) => ({ label, value }));
}

const joined = (parts: (string | null | undefined)[]) => parts.filter(present).join(" · ");

/** "Hoy" list row: title = description, subtitle `fecha · tipo`, fields Importe / Medio / Ticket. */
export function todayRecord(movement: ReportMovement): RecordItem {
  return {
    // `id` is unique per ledger row: two identical-looking movements never share a key (legacy crashed here).
    key: `today-${movement.id}`,
    title: movement.description || "Sin nombre",
    subtitle: joined([movement.businessDate, movement.kind]),
    fields: visibleFields([
      ["Importe", formatMoney(movement.amount)],
      ["Medio", movement.paymentMethod],
      ["Ticket", movement.ticketId],
    ]),
  };
}

/** "Mes actual" list row: subtitle `fecha · tipo · categoria`, fields Importe / Producto / Medio. */
export function monthRecord(movement: ReportMovement): RecordItem {
  return {
    key: `month-${movement.id}`,
    title: movement.description || "Sin nombre",
    subtitle: joined([movement.businessDate, movement.kind, movement.category]),
    fields: visibleFields([
      ["Importe", formatMoney(movement.amount)],
      ["Producto", movement.productName],
      ["Medio", movement.paymentMethod],
    ]),
  };
}

/** "Stock" list row: subtitle `categoria · Crítico|OK`, fields Stock `{n:g} · mínimo {m:g}` and Precio. */
export function stockRecord(row: StockReportRow, index: number): RecordItem {
  return {
    key: `stock-${index}`,
    title: row.name || "Sin nombre",
    subtitle: joined([row.categoryName, row.status]),
    fields: [
      { label: "Stock", value: `${formatG(row.stock)} · mínimo ${formatG(row.minStock)}` },
      { label: "Precio", value: formatMoney(row.salePrice) },
    ],
  };
}
