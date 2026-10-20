// Test-only runtime adapters (a module may not import another module's internals; these mirror the cash ones).
import { randomUUID } from "node:crypto";
import type { Clock, IdGenerator } from "@/shared/application/runtime";

export class SystemClockForTests implements Clock {
  now() {
    return new Date();
  }
  businessDate() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  }
}

export class UuidForTests implements IdGenerator {
  next() {
    return randomUUID();
  }
}
