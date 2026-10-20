import type { ReactNode } from "react";
import type { ActionState } from "@/shared/ui";
import type { Cents } from "@/shared/domain/money";
import type { AdminDashboard, CashAdminOverview, CashierHome, MovementFilters, ReportMovement, ReportMovementKind, TicketLine } from "../domain";

export interface CashierHomeData {
  /** The user's open cash session number (legacy "Caja #N"), or null when the register is closed. */
  openSessionNumber: number | null;
  home: CashierHome;
}

export interface CheckOpenCashResult extends ActionState {
  /** True when any user has an open cash session. */
  hasOpenSession?: boolean;
}

export interface AdminHomeActions {
  /** "Cerrar caja" quick action: is there any open cash session at all? */
  checkOpenCash: () => Promise<CheckOpenCashResult>;
}

/** Bodies of the three dialogs, rendered by their modules; this screen only owns open/close state. */
export interface AdminHomeDialogs {
  expense: ReactNode;
  purchase: ReactNode;
  product: ReactNode;
}

export interface AdminHomeData {
  dashboard: AdminDashboard;
}

/** One of the user's tickets of the selected day, with the lines "Detalle del ticket seleccionado" shows. */
export interface MyTicketRow {
  ticketId: string;
  /** "HH:MM:SS" */
  time: string;
  items: number;
  total: Cents;
  lines: TicketLine[];
}

export interface MyTicketsData {
  /** Selected business date (YYYY-MM-DD). */
  businessDate: string;
  tickets: MyTicketRow[];
}

export interface TicketVoidInput {
  ticketId: string;
  reason: string;
}
export type TicketVoidAction = (input: TicketVoidInput) => Promise<ActionState>;

export interface MovementsData {
  filters: MovementFilters;
  /** Every movement of the period (the screen lists the first 60 like the legacy; the CSV has all of them). */
  movements: ReportMovement[];
}

/** The movement "Cargar movimiento" selected for voiding. */
export interface MovementToVoid {
  number: number;
  businessDate: string;
  kind: ReportMovementKind;
  description: string;
  amount: Cents;
  voided: boolean;
  voidReason: string | null;
}

export interface MovementLookupInput {
  number: number;
}
export interface MovementLookupResult extends ActionState {
  movement?: MovementToVoid;
}
export interface MovementVoidInput {
  number: number;
  reason: string;
}

export interface MovementsActions {
  find: (input: MovementLookupInput) => Promise<MovementLookupResult>;
  void: (input: MovementVoidInput) => Promise<ActionState>;
}

/** A Server Action used as a form `action` (same shape as React's `useActionState` reducer). */
export type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export interface CashAdminData {
  overview: CashAdminOverview;
}

export interface CashAdminActions {
  /** "Movimiento autorizado": records a manual cash movement in an open session. */
  recordMovement: FormAction;
}
