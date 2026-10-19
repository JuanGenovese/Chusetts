import { randomUUID } from "node:crypto";
import type { Clock, IdGenerator } from "../application/ports";

const TIME_ZONE = "America/Argentina/Buenos_Aires";

export class SystemClock implements Clock {
  now() {
    return new Date();
  }
  businessDate() {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
  }
}

export class UuidGenerator implements IdGenerator {
  next() {
    return randomUUID();
  }
}
