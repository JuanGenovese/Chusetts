import { DomainError } from "@/shared/domain/errors";

/** Business-rule violation of the movements ledger; messages are user-facing Spanish, verbatim from the legacy app. */
export class LedgerError extends DomainError {
  constructor(message: string, code = "LEDGER_ERROR") {
    super(code, message);
  }
}

export class LedgerPermissionError extends DomainError {
  constructor(message: string) {
    super("PERMISSION_DENIED", message);
  }
}
