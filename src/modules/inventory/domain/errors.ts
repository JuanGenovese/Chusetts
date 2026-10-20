import { DomainError } from "@/shared/domain/errors";

/** Equivalent of the legacy `InventoryError`; messages are user-facing Spanish, verbatim from the legacy app. */
export class InventoryError extends DomainError {
  constructor(message: string, code = "INVENTORY_ERROR") {
    super(code, message);
  }
}
