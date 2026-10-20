import type { CashSession } from "../domain";
import type { CashSessionOverview } from "../application";

/** Result of a Server Action: `message` is the flash text on success and the error text on failure. */
export interface CashActionState {
  ok: boolean;
  message?: string;
}

export type CashAction = (prev: CashActionState, formData: FormData) => Promise<CashActionState>;

export interface ShiftActions {
  open: CashAction;
  close: CashAction;
}

export interface ShiftPageData {
  /** The user's open session with its figures, or null when the cash register is closed. */
  overview: CashSessionOverview | null;
  /** Latest sessions of the user, newest first ("Mis últimos cierres"). */
  recentSessions: CashSession[];
}
