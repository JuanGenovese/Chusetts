/** Result of a Server Action used by a form: `message` is the success text or the error text. */
export interface ActionState {
  ok: boolean;
  message?: string;
}
