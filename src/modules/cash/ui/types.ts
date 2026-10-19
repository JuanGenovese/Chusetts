import type { CashSessionOverview } from "../application";

export interface CashActionState {
  ok: boolean;
  message?: string;
}

export type CashAction = (prev: CashActionState, formData: FormData) => Promise<CashActionState>;

export interface CashActions {
  open: CashAction;
  recordMovement: CashAction;
  close: CashAction;
}

export interface CashPageData {
  user: { displayName: string; role: "admin" | "cashier" };
  overview: CashSessionOverview | null;
}
