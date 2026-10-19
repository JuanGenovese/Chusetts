import type { Cents } from "@/shared/domain/money";
import { PAYMENT_METHODS, type AmountsByMethod, type PaymentMethod, type PaymentTotal } from "./types";

export function emptyAmounts(): AmountsByMethod {
  return { cash: 0, transfer: 0, card: 0, mercado_pago: 0, other: 0 };
}

function isPaymentMethod(value: string): value is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(value);
}

/**
 * Expected amounts per payment method.
 * Cash = ledger balance (opening + movements). Non-cash = sales minus expenses/purchases.
 * Unknown methods are folded into `other` (legacy behavior).
 */
export function calculateExpectedAmounts(cashBalance: Cents, nonCashTotals: readonly PaymentTotal[]): AmountsByMethod {
  const expected = emptyAmounts();
  expected.cash = cashBalance;
  for (const row of nonCashTotals) {
    if (row.paymentMethod === "cash") continue;
    const method: PaymentMethod = isPaymentMethod(row.paymentMethod) ? row.paymentMethod : "other";
    if (row.kind === "sale") expected[method] += row.total;
    else expected[method] -= row.total; // expense | purchase
  }
  return expected;
}

export function sumElectronic(amounts: AmountsByMethod): Cents {
  return amounts.transfer + amounts.card + amounts.mercado_pago + amounts.other;
}
