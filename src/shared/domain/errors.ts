/**
 * Base class for all business-rule violations.
 * `message` is user-facing (Spanish); `code` is a stable machine-readable identifier.
 */
export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}
