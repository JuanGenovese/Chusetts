import { describe, expect, it } from "vitest";
import { adjustStockSchema, productIdSchema, removeRecipeComponentSchema, saveRecipeComponentSchema, updateProductSchema } from "./product-schemas";

const ID = "6f1d5c1e-0b0b-4e54-a8b6-0f4f6a0f9a11";
const OTHER = "0a7c63ee-6e0a-4f1b-9b9e-9f6c5a43d111";

describe("updateProductSchema", () => {
  const input = { id: ID, name: " Fernet ", price: "4500,00", categoryId: OTHER, sellable: true, sku: " F-1 " };
  it("trims text and parses the price into cents", () => {
    expect(updateProductSchema.parse(input)).toEqual({ id: ID, name: "Fernet", price: 450000, categoryId: OTHER, sellable: true, sku: "F-1" });
  });
  it("requires a name with the legacy message", () => {
    expect(updateProductSchema.safeParse({ ...input, name: "  " }).error?.issues[0].message).toBe("El nombre es obligatorio.");
  });
  it("rejects invalid or negative prices", () => {
    expect(updateProductSchema.safeParse({ ...input, price: "abc" }).success).toBe(false);
    expect(updateProductSchema.safeParse({ ...input, price: "-1" }).success).toBe(false);
  });
  it("rejects ids that are not uuids", () => {
    expect(updateProductSchema.safeParse({ ...input, id: "1; drop" }).success).toBe(false);
    expect(updateProductSchema.safeParse({ ...input, categoryId: "" }).success).toBe(false);
  });
});

describe("adjustStockSchema", () => {
  const input = { productId: ID, counted: "12,5", reason: "  conteo  " };
  it("parses the counted quantity and trims the reason", () => {
    expect(adjustStockSchema.parse(input)).toEqual({ productId: ID, counted: 12.5, reason: "conteo" });
  });
  it("requires the reason with the legacy message", () => {
    expect(adjustStockSchema.safeParse({ ...input, reason: "   " }).error?.issues[0].message).toBe("El motivo del ajuste es obligatorio.");
  });
  it("rejects negative or malformed counts", () => {
    expect(adjustStockSchema.safeParse({ ...input, counted: "-1" }).success).toBe(false);
    expect(adjustStockSchema.safeParse({ ...input, counted: "x" }).success).toBe(false);
  });
});

describe("saveRecipeComponentSchema", () => {
  const input = { productId: ID, componentId: OTHER, quantity: "70", unit: "ml" };
  it("parses decimal quantities", () => {
    expect(saveRecipeComponentSchema.parse({ ...input, quantity: "0,5" })).toMatchObject({ quantity: 0.5, unit: "ml" });
  });
  it("requires a positive quantity (legacy minimum 0.0001)", () => {
    expect(saveRecipeComponentSchema.safeParse({ ...input, quantity: "0" }).error?.issues[0].message).toBe("La cantidad consumida debe ser mayor que cero.");
    expect(saveRecipeComponentSchema.safeParse({ ...input, quantity: "0,0001" }).success).toBe(true);
    expect(saveRecipeComponentSchema.safeParse({ ...input, quantity: "abc" }).success).toBe(false);
  });
});

describe("ids", () => {
  it("validates single ids and recipe removal", () => {
    expect(productIdSchema.safeParse({ productId: ID }).success).toBe(true);
    expect(productIdSchema.safeParse({ productId: "x" }).success).toBe(false);
    expect(removeRecipeComponentSchema.safeParse({ productId: ID, recipeId: OTHER }).success).toBe(true);
    expect(removeRecipeComponentSchema.safeParse({ productId: ID, recipeId: "" }).success).toBe(false);
  });
});
