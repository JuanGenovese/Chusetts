import { DomainError } from "@/shared/domain/errors";

/** Equivalent of the legacy `CashSessionError`. */
export class CashSessionError extends DomainError {
  constructor(message: string, code = "CASH_SESSION_ERROR") {
    super(code, message);
  }
}

export class PermissionDeniedError extends DomainError {
  constructor(message: string) {
    super("PERMISSION_DENIED", message);
  }
}
