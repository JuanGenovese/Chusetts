import { describe, expect, it } from "vitest";
import {
  catalogCardStockLabel,
  catalogPriceLabel,
  filterCatalog,
  type CatalogEntry,
  type CatalogFilters,
} from "./catalog-browse";

const entry = (patch: Partial<CatalogEntry> & { id: string; name: string }): CatalogEntry => ({
  sku: "P-0001",
  categoryName: "Bebidas",
  salePrice: 450000,
  active: true,
  isSellable: true,
  isSupply: false,
  controlsStock: true,
  stock: 10,
  minStock: 2,
  stockUnit: "unidad",
  ...patch,
});

const all: CatalogFilters = { search: "", status: "Activos", kind: "Todos", stock: "Todos" };

const list = [
  entry({ id: "1", name: "Coca Cola", sku: "P-0001", categoryName: "Gaseosas" }),
  entry({ id: "2", name: "Fernet", sku: "FER-1", categoryName: "Tragos", stock: 2, minStock: 2 }),
  entry({ id: "3", name: "Vasos", categoryName: "Descartables", isSupply: true, isSellable: false, stock: 0 }),
  entry({ id: "4", name: "Hamburguesa", categoryName: "Comidas", controlsStock: false, stock: 0 }),
  entry({ id: "5", name: "Viejo", active: false }),
];
const ids = (rows: CatalogEntry[]) => rows.map((r) => r.id);

describe("filterCatalog", () => {
  it("shows only active products by default and keeps the input order", () => {
    expect(ids(filterCatalog(list, all))).toEqual(["1", "2", "3", "4"]);
  });
  it("filters by status", () => {
    expect(ids(filterCatalog(list, { ...all, status: "Inactivos" }))).toEqual(["5"]);
    expect(ids(filterCatalog(list, { ...all, status: "Todos" }))).toEqual(["1", "2", "3", "4", "5"]);
  });
  it("filters by kind: Producto = sellable, Insumo = supply", () => {
    expect(ids(filterCatalog(list, { ...all, kind: "Producto" }))).toEqual(["1", "2", "4"]);
    expect(ids(filterCatalog(list, { ...all, kind: "Insumo" }))).toEqual(["3"]);
  });
  it("searches name, code and category case-insensitively", () => {
    expect(ids(filterCatalog(list, { ...all, search: "  fer " }))).toEqual(["2"]);
    expect(ids(filterCatalog(list, { ...all, search: "p-0001" }))).toEqual(["1", "3", "4"]);
    expect(ids(filterCatalog(list, { ...all, search: "descart" }))).toEqual(["3"]);
  });
  it("Controlado keeps stock-controlled products", () => {
    expect(ids(filterCatalog(list, { ...all, stock: "Controlado" }))).toEqual(["1", "2", "3"]);
  });
  it("Bajo keeps controlled products at or below the minimum", () => {
    expect(ids(filterCatalog(list, { ...all, stock: "Bajo" }))).toEqual(["2", "3"]);
  });
  it("Sin stock keeps controlled products with no stock", () => {
    expect(ids(filterCatalog(list, { ...all, stock: "Sin stock" }))).toEqual(["3"]);
  });
});

describe("card labels", () => {
  it("shows the stock with its unit, or Sin control", () => {
    expect(catalogCardStockLabel(entry({ id: "1", name: "a", stock: 12.5, stockUnit: "l" }))).toBe("12,5 l");
    expect(catalogCardStockLabel(entry({ id: "1", name: "a", stock: 3 }))).toBe("3 unidad");
    expect(catalogCardStockLabel(entry({ id: "1", name: "a", controlsStock: false }))).toBe("Sin control");
  });
  it("shows the price only for sellable products", () => {
    expect(catalogPriceLabel(entry({ id: "1", name: "a", salePrice: 123450 }))).toBe("$ 1.235");
    expect(catalogPriceLabel(entry({ id: "1", name: "a", isSellable: false }))).toBe("—");
  });
});
