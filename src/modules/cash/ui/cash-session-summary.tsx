import { formatCents } from "@/shared/domain/money";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type CashMovement, type CashMovementType } from "../domain";
import type { CashSessionOverview } from "../application";

const MOVEMENT_LABELS: Record<CashMovementType, string> = {
  OPENING: "Apertura",
  MANUAL_INCOME: "Ingreso manual",
  WITHDRAWAL: "Retiro",
  CASH_EXPENSE: "Gasto en efectivo",
  POSITIVE_ADJUSTMENT: "Ajuste positivo",
  NEGATIVE_ADJUSTMENT: "Ajuste negativo",
  CASH_SALE: "Venta en efectivo",
  CASH_OUTFLOW: "Egreso en efectivo",
  SALE_REFUND: "Devolución",
  OUTFLOW_REVERSAL: "Reversa de egreso",
  CLOSING: "Cierre",
};

const timeFormat = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  dateStyle: "short",
  timeStyle: "short",
});

function MovementRow({ movement }: { movement: CashMovement }) {
  const sign = movement.sign === 1 ? "+" : movement.sign === -1 ? "-" : "";
  return (
    <tr className="border-t border-zinc-100">
      <td className="py-1.5 pr-3 text-zinc-500">{timeFormat.format(movement.occurredAt)}</td>
      <td className="py-1.5 pr-3">{MOVEMENT_LABELS[movement.type]}</td>
      <td className="py-1.5 pr-3 text-zinc-600">{movement.reason}</td>
      <td className="py-1.5 text-right tabular-nums">
        {sign}
        {formatCents(movement.amount)}
      </td>
    </tr>
  );
}

/** Presentational: balance, expected amounts per payment method and the movement list. */
export function CashSessionSummary({ overview }: { overview: CashSessionOverview }) {
  const { session, balance, expected, salesSummary, movements } = overview;
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-zinc-500">Fecha operativa</dt>
          <dd className="font-medium">{session.businessDate}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Efectivo inicial</dt>
          <dd className="font-medium tabular-nums">{formatCents(session.openingCash)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Efectivo en caja</dt>
          <dd className="font-medium tabular-nums">{formatCents(balance)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Ventas ({salesSummary.tickets} tickets)</dt>
          <dd className="font-medium tabular-nums">{formatCents(salesSummary.sales)}</dd>
        </div>
      </dl>
      <div>
        <h3 className="mb-1 text-sm font-semibold">Esperado por medio de pago</h3>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-5">
          {PAYMENT_METHODS.map((method) => (
            <li key={method} className="flex justify-between gap-2 sm:flex-col">
              <span className="text-zinc-500">{PAYMENT_METHOD_LABELS[method]}</span>
              <span className="tabular-nums">{formatCents(expected[method])}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="mb-1 text-sm font-semibold">Movimientos</h3>
        <table className="w-full text-sm">
          <tbody>
            {movements.map((m) => (
              <MovementRow key={m.id} movement={m} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
