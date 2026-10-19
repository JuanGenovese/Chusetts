export interface Clock {
  now(): Date;
  /** Operating date (YYYY-MM-DD) in the bar's local timezone. */
  businessDate(): string;
}

export interface IdGenerator {
  next(): string;
}
