import { describe, expect, it } from "vitest";
import { CatalogError } from "./errors";
import { defaultSku, validateNewProduct, validateProductUpdate, validateSupplierValues } from "./catalog-rules";

const base = {
  name: " Fernet ",
  stockUnit: "ML",
  purchaseUnit: "Botella ",
  purchaseFactor: 750,
  initialStock: 0,
  minStock: 0,
  controlsStock: true,
  isCompound: false,
  salePrice: 0,
  unitCost: 0,
};

describe("defaultSku", () => {
  it("pads the product number like the legacy P-%04d", () => {
    expect(defaultSku(7)).toBe("P-0007");
    expect(defaultSku(12345)).toBe("P-12345");
  });
});

describe("validateNewProduct", () => {
  it("normalizes name, stock unit and purchase unit", () => {
    expect(validateNewProduct(base)).toMatchObject({
      name: "Fernet",
      stockUnit: "ml",
      purchaseUnit: "botella",
      purchaseFactor: 750,
      controlsStock: true,
    });
  });
  it("defaults the purchase unit to the stock unit", () => {
    expect(validateNewProduct({ ...base, purchaseUnit: "  " }).purchaseUnit).toBe("ml");
  });
  it("maps legacy stock unit aliases", () => {
    expect(validateNewProduct({ ...base, stockUnit: "pinta" }).stockUnit).toBe("unidad");
  });
  it("rejects invalid input with the legacy messages, in legacy order", () => {
    expect(() => validateNewProduct({ ...base, name: "  " })).toThrow(new CatalogError("El nombre es obligatorio."));
    expect(() => validateNewProduct({ ...base, stockUnit: "oz" })).toThrow("Unidad no compatible. Usá unidad, ml, l, g o kg.");
    expect(() => validateNewProduct({ ...base, purchaseFactor: 0 })).toThrow(
      "La conversión de compra a stock debe ser mayor que cero.",
    );
    expect(() => validateNewProduct({ ...base, initialStock: -1 })).toThrow("El stock no puede ser negativo.");
    expect(() => validateNewProduct({ ...base, minStock: -1 })).toThrow("El stock no puede ser negativo.");
    expect(() => validateNewProduct({ ...base, controlsStock: false, initialStock: 3 })).toThrow(
      "Un producto sin stock propio no puede tener stock inicial.",
    );
  });
  it("a compound product never controls stock (so it cannot have initial stock either)", () => {
    expect(validateNewProduct({ ...base, isCompound: true }).controlsStock).toBe(false);
    expect(() => validateNewProduct({ ...base, isCompound: true, initialStock: 1 })).toThrow(
      "Un producto sin stock propio no puede tener stock inicial.",
    );
  });
  it("guards money: integer, non negative cents", () => {
    expect(() => validateNewProduct({ ...base, salePrice: -1 })).toThrow("El precio de venta no puede ser negativo.");
    expect(() => validateNewProduct({ ...base, unitCost: -1 })).toThrow("El costo no puede ser negativo.");
    expect(() => validateNewProduct({ ...base, salePrice: 10.5 })).toThrow("El importe debe ser un número entero de centavos.");
  });
});

describe("validateProductUpdate", () => {
  const update = { name: "x", stockUnit: "kg", purchaseUnit: "", purchaseFactor: 1, minStock: 0, salePrice: 0, unitCost: 0 };
  it("validates like the legacy update", () => {
    expect(validateProductUpdate(update)).toMatchObject({ name: "x", stockUnit: "kg", purchaseUnit: "kg" });
    expect(() => validateProductUpdate({ ...update, name: "" })).toThrow("El nombre es obligatorio.");
    expect(() => validateProductUpdate({ ...update, purchaseFactor: -2 })).toThrow(
      "La conversión de compra a stock debe ser mayor que cero.",
    );
    expect(() => validateProductUpdate({ ...update, minStock: -1 })).toThrow("El stock mínimo no puede ser negativo.");
  });
});

describe("validateSupplierValues", () => {
  const input = { name: " Norte ", email: " Ventas@Norte.TEST " };
  it("trims, lowercases the email and fills defaults", () => {
    expect(validateSupplierValues(input)).toEqual({
      name: "Norte", legalName: "", taxId: "", business: "", contact: "", phone: "", email: "ventas@norte.test", address: "", notes: "",
    });
  });
  it("validates name, email and CUIT", () => {
    expect(() => validateSupplierValues({ name: " " })).toThrow("El nombre del proveedor es obligatorio.");
    expect(() => validateSupplierValues({ name: "a", email: "sin-arroba" })).toThrow(
      "El correo electrónico no tiene un formato válido.",
    );
    expect(() => validateSupplierValues({ name: "a", taxId: "30-1234x" })).toThrow(
      "El CUIT solo puede contener números y guiones.",
    );
    expect(validateSupplierValues({ name: "a", taxId: "30-12345678-9" }).taxId).toBe("30-12345678-9");
  });
});
