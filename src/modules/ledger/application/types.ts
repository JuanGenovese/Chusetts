import type { Cents } from "@/shared/domain/money";
import type { Actor, MovementKind } from "../domain";
import type { StockAdjustmentPlanView } from "./ports/repositories";

export interface SaleLineInput {
  productId: string;
  quantity: number;
}

export interface RegisterSaleTicketInput {
  actor: Actor;
  lines: SaleLineInput[];
  paymentMethod: string;
  notes?: string;
}

export interface RegisterSaleTicketResult {
  ticketId: string;
  orderId: string;
  total: Cents;
  movementIds: string[];
}

export interface AdminMovementInput {
  actor: Actor;
  kind: MovementKind;
  businessDate: string;
  category: string | null;
  description: string;
  productId?: string | null;
  supplierId?: string | null;
  quantity: number;
  unitPrice: Cents;
  amount: Cents;
  paymentMethod: string;
  notes?: string;
}

export interface AdminMovementResult {
  movementId: string;
  ticketId: string | null;
}

export interface RegisterExpenseInput {
  actor: Actor;
  businessDate: string;
  description: string;
  category: string;
  amount: Cents;
  paymentMethod: string;
}

export interface RegisterPurchaseInput {
  actor: Actor;
  businessDate: string;
  description: string;
  category: string;
  productId?: string | null;
  supplierId?: string | null;
  quantity: number;
  unitCost: Cents;
  paymentMethod: string;
}

export interface RegisterAdminSaleInput {
  actor: Actor;
  businessDate: string;
  description: string;
  productId?: string | null;
  quantity: number;
  unitPrice: Cents;
  paymentMethod: string;
}

export interface StockAdjustmentRecord extends StockAdjustmentPlanView {
  movementId: string;
}
