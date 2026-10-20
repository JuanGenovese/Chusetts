import type { ReactNode } from "react";
import type { ActionState } from "@/shared/ui";
import type { AdminDashboard, CashierHome } from "../domain";

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
