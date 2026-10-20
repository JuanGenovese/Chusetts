import { formatG } from "@/shared/domain/quantity";
import { formatTimestamp } from "@/shared/domain/datetime";
import { formatMoney } from "@/shared/domain/money";
import type { RecordItem } from "@/shared/ui";
import {
  cashEventCode,
  cashMovementTitle,
  formatEventDetail,
  sessionStatusLabel,
  signedAmount,
  type CashAdminSession,
  type CashAuditEvent,
  type CashLedgerEntry,
  type CashSessionHistoryEntry,
  type ReportMovement,
  type StockReportRow,
} from "../domain";

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

/** Movements history row: title = description, subtitle `fecha · tipo · categoria`, six labelled fields. */
export function historyRecord(movement: ReportMovement): RecordItem {
  return {
    key: `history-${movement.id}`,
    title: movement.description || "Sin nombre",
    subtitle: joined([movement.businessDate, movement.kind, movement.category]),
    fields: visibleFields([
      ["Importe", formatMoney(movement.amount)],
      ["Medio de pago", movement.paymentMethod],
      ["Producto", movement.productName],
      ["Usuario", movement.createdByUsername],
      ["Estado", movement.voided ? "Anulado" : "Confirmado"],
      ["Ticket", movement.ticketId],
    ]),
  };
}

/** Admin cash "Cajas" tab. */
export function openSessionRecord(session: CashAdminSession): RecordItem {
  return {
    key: `sessions-${session.id}`,
    title: `Caja #${session.number}`,
    subtitle: joined([session.openedBy, session.businessDate]),
    fields: visibleFields([
      ["Apertura", formatTimestamp(session.openedAt)],
      ["Efectivo", formatMoney(session.cashAvailable)],
    ]),
  };
}

/** Admin cash "Libro de efectivo" tab. */
export function ledgerRecord(entry: CashLedgerEntry): RecordItem {
  return {
    key: `ledger-${entry.id}`,
    title: cashMovementTitle(entry.type),
    subtitle: joined([formatTimestamp(entry.occurredAt), entry.responsible, entry.actor]),
    fields: visibleFields([
      ["Monto", signedAmount(entry.sign, entry.amount)],
      ["Saldo", formatMoney(entry.balanceAfter)],
      ["Motivo", entry.reason],
    ]),
  };
}

/** Admin cash "Cierres y auditoría" tab: close data only exists for closed sessions. */
export function sessionHistoryRecord(session: CashSessionHistoryEntry): RecordItem {
  return {
    key: `audit-${session.id}`,
    title: `Caja #${session.number}`,
    subtitle: joined([session.businessDate, session.openedBy, sessionStatusLabel(session.status)]),
    fields: visibleFields([
      ["Apertura", formatTimestamp(session.openedAt)],
      ["Cierre", session.closedAt ? formatTimestamp(session.closedAt) : null],
      ["Diferencia", session.difference === null ? null : formatMoney(session.difference)],
    ]),
  };
}

/** Admin cash audit "Eventos" list. */
export function auditEventRecord(event: CashAuditEvent): RecordItem {
  return {
    key: `event-${event.id}`,
    title: `${cashEventCode(event.type)} · Caja #${event.sessionNumber}`,
    subtitle: joined([formatTimestamp(event.occurredAt), event.actor]),
    fields: visibleFields([["Detalle", formatEventDetail(event.detail)]]),
  };
}
