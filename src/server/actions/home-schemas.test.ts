import { describe, expect, it } from "vitest";
import { productSchema, quickEntrySchema } from "./home-schemas";

const expense = { kind: "Gasto", description: "Luz", category: "Servicios", amount: "1234,50", date: "2026-10-19", paymentMethod: "Nave" };
const purchase = {
  kind: "Compra", description: "Barril", productId: "p1", supplierId: "", quantity: "2,5", unitCost: "8000,00",
  category: "Compra cerveza", date: "2026-10-19", paymentMethod: "Efectivo",
};

describe("quickEntrySchema", () => {
  it("parses an expense into cents", () => {
    const parsed = quickEntrySchema.parse(expense);
    expect(parsed).toMatchObject({ kind: "Gasto", amount: 123450, description: "Luz" });
  });
  it("parses a purchase: decimal quantity, cents, empty supplier = null", () => {
    expect(quickEntrySchema.parse(purchase)).toMatchObject({ quantity: 2.5, unitCost: 800000, supplierId: null, productId: "p1" });
  });
  it("reports the missing description first (legacy order)", () => {
    const result = quickEntrySchema.safeParse({ ...expense, description: "  ", amount: "abc" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("La descripción es obligatoria.");
  });
  it("rejects negative or malformed amounts", () => {
    expect(quickEntrySchema.safeParse({ ...expense, amount: "-5" }).success).toBe(false);
    expect(quickEntrySchema.safeParse({ ...expense, amount: "1,234" }).success).toBe(false);
    expect(quickEntrySchema.safeParse({ ...purchase, quantity: "x" }).success).toBe(false);
  });
  it("rejects a malformed date", () => {
    expect(quickEntrySchema.safeParse({ ...expense, date: "19/10/2026" }).success).toBe(false);
  });
});

describe("productSchema", () => {
  const product = { kind: "Producto", name: " Coca ", price: "0,00", categoryId: "c1", sellable: false, sku: "", components: [] };
  it("trims the name and parses the price", () => {
    expect(productSchema.parse({ ...product, price: "4500,00" })).toMatchObject({ name: "Coca", price: 450000 });
  });
  it("requires a name with the legacy message", () => {
    const result = productSchema.safeParse({ ...product, name: "   " });
    expect(result.error?.issues[0].message).toBe("El nombre del producto es obligatorio.");
  });
  it("accepts integer recipe quantities only", () => {
    const row = { componentId: "i1", quantity: "50", unit: "ml" };
    expect(productSchema.safeParse({ ...product, components: [row] }).success).toBe(true);
    expect(productSchema.safeParse({ ...product, components: [{ ...row, quantity: "2,5" }] }).success).toBe(false);
  });
});
