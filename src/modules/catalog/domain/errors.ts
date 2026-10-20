import { DomainError } from "@/shared/domain/errors";

/** Equivalent of the `ValueError`s the legacy catalog repositories raise; messages are user-facing Spanish, verbatim. */
export class CatalogError extends DomainError {
  constructor(message: string, code = "CATALOG_ERROR") {
    super(code, message);
  }
}
