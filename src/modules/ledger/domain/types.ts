import type { Cents } from "@/shared/domain/money";

/** Legacy `movimientos.tipo` values: user-visible Spanish data, kept verbatim. */
export const MOVEMENT_KINDS = ["Venta", "Gasto", "Compra", "Ajuste Stock"] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export type ActorRole = "admin" | "cashier";

/** Who performs an operation. The role drives the legacy permissions (admin vs cajero). */
export interface Actor {
  id: string;
  role: ActorRole;
}

/** A row of the ledger (legacy: movimientos). `voided` replaces the legacy `anulada` flag. */
export interface LedgerMovement {
  id: string;
  /** Legacy numeric id (display + insertion order). Assigned by persistence; 0 before the first insert. */
  number: number;
  businessDate: string; // YYYY-MM-DD
  kind: MovementKind;
  category: string | null;
  categoryId: string | null;
  description: string;
  productId: string | null;
  productName: string | null;
  /** Units sold / bought; signed stock delta for "Ajuste Stock". */
  quantity: number;
  unitPrice: Cents;
  amount: Cents;
  paymentMethodId: string | null;
  paymentMethodName: string | null;
  supplierId: string | null;
  supplierName: string;
  notes: string;
  createdBy: string;
  createdAt: Date;
  voided: boolean;
  voidReason: string | null;
  voidedBy: string | null;
  voidedAt: Date | null;
  ticketId: string | null;
  cashSessionId: string | null;
  saleOrderId: string | null;
}

export type SaleOrderStatus = "CONFIRMED" | "VOIDED";

/** Legacy: ordenes_venta. */
export interface SaleOrder {
  id: string;
  ticketId: string;
  businessDate: string;
  cashSessionId: string | null;
  status: SaleOrderStatus;
  paymentMethodId: string | null;
  total: Cents;
  notes: string;
  createdBy: string;
  createdAt: Date;
  voidedAt: Date | null;
  voidedBy: string | null;
  voidReason: string | null;
}

/** Legacy: lineas_orden_venta. */
export interface SaleOrderLine {
  id: string;
  orderId: string;
  sequence: number;
  productId: string | null;
  productName: string;
  quantity: number;
  unitPrice: Cents;
  subtotal: Cents;
  movementId: string | null;
}
