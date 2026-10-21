import { describe, expect, it } from "vitest";
import { saleSchema } from "./sale-schema";

const valid = { lines: [{ productId: "p1", quantity: 2 }], paymentMethod: "Mercado Pago", notes: "  mesa 4 " };

describe("saleSchema", () => {
  it("accepts a cart and trims the observation", () => {
    expect(saleSchema.parse(valid)).toEqual({ lines: [{ productId: "p1", quantity: 2 }], paymentMethod: "Mercado Pago", notes: "mesa 4" });
  });
  it("empty cart -> legacy message", () => {
    const r = saleSchema.safeParse({ ...valid, lines: [] });
    expect(r.error?.issues[0].message).toBe("El carrito está vacío.");
  });
  it("rejects non-positive or non-finite quantities", () => {
    expect(saleSchema.safeParse({ ...valid, lines: [{ productId: "p1", quantity: 0 }] }).success).toBe(false);
    expect(saleSchema.safeParse({ ...valid, lines: [{ productId: "p1", quantity: -1 }] }).success).toBe(false);
    expect(saleSchema.safeParse({ ...valid, lines: [{ productId: "p1", quantity: Infinity }] }).success).toBe(false);
  });
  it("requires a payment method; notes default to empty", () => {
    expect(saleSchema.safeParse({ ...valid, paymentMethod: " " }).success).toBe(false);
    expect(saleSchema.parse({ lines: valid.lines, paymentMethod: "Mercado Pago" }).notes).toBe("");
  });
});
