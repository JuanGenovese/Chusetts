import { describe, expect, it } from "vitest";
import { findMovementSchema, voidMovementSchema, voidTicketSchema } from "./void-schemas";

const message = (result: { success: false; error: { issues: { message: string }[] } } | { success: true }) =>
  result.success ? null : result.error.issues[0].message;

describe("voidTicketSchema", () => {
  it("trims the reason and the ticket id", () => {
    expect(voidTicketSchema.parse({ ticketId: " T-1 ", reason: "  cliente se fue " })).toEqual({ ticketId: "T-1", reason: "cliente se fue" });
  });

  it("requires a reason (legacy copy) and a ticket", () => {
    expect(message(voidTicketSchema.safeParse({ ticketId: "T-1", reason: "   " }))).toBe("El motivo es obligatorio.");
    expect(message(voidTicketSchema.safeParse({ ticketId: "", reason: "x" }))).toBe("Ticket inválido.");
  });
});

describe("findMovementSchema / voidMovementSchema", () => {
  it("accepts a positive integer movement number", () => {
    expect(findMovementSchema.parse({ number: 12 })).toEqual({ number: 12 });
    expect(voidMovementSchema.parse({ number: 12, reason: " duplicado " })).toEqual({ number: 12, reason: "duplicado" });
  });

  it("rejects zero, negatives, fractions and non numbers", () => {
    for (const number of [0, -3, 1.5, Number.NaN, "7"]) {
      expect(findMovementSchema.safeParse({ number }).success).toBe(false);
    }
  });

  it("requires the administrative reason with the legacy copy", () => {
    expect(message(voidMovementSchema.safeParse({ number: 1, reason: " " }))).toBe("El motivo de anulación es obligatorio.");
  });
});
