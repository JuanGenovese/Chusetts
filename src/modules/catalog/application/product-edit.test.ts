import { describe, expect, it } from "vitest";
import type { Product } from "../domain";
import { productUpdateFromEdits } from "./product-edit";

const product: Product = {
  id: "p1", number: 3, name: "Fernet", sku: "P-0003", description: "desc", categoryId: "c1", categoryName: "Tragos",
  salePrice: 450000, unitCost: 120000, minStock: 4, active: true, isSellable: true, isPurchasable: false, isSupply: false,
  isCompound: true, controlsStock: false, stockUnit: "ml", stockUnitId: "u1", stockUnitName: "Mililitro", purchaseUnit: "botella",
  purchaseFactor: 750, supplierId: "s1", supplierName: "Proveedor", createdAt: new Date(0), updatedAt: null, updatedBy: null,
};
const edits = { name: "Fernet 70", categoryId: "c2", price: 500000, sellable: false, sku: "F-70" };

describe("productUpdateFromEdits", () => {
  it("applies only what the Ficha form edits and carries every other field over", () => {
    expect(productUpdateFromEdits(product, edits, "admin-1")).toEqual({
      id: "p1", name: "Fernet 70", categoryId: "c2", isSellable: true, salePrice: 500000, sku: "F-70",
      controlsStock: false, stockUnit: "ml", unitCost: 120000, minStock: 4, description: "desc", isPurchasable: false,
      isSupply: false, isCompound: true, purchaseUnit: "botella", purchaseFactor: 750, supplierId: "s1", actorId: "admin-1",
    });
  });
  it("only supplies can change 'Se vende'; a supply that is not sold has no price", () => {
    const supply = { ...product, isSupply: true, isSellable: true };
    expect(productUpdateFromEdits(supply, edits, "a")).toMatchObject({ isSellable: false, salePrice: 0 });
    expect(productUpdateFromEdits(supply, { ...edits, sellable: true }, "a")).toMatchObject({ isSellable: true, salePrice: 500000 });
  });
});
