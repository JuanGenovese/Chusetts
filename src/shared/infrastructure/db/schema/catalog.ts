import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";

// Money columns are INTEGER CENTS (bigint, mode "number").
const cents = (name: string) => bigint(name, { mode: "number" });
// Decimal quantities / factors: numeric(18,9) like the legacy round(x, 9).
const decimal = (name: string) => numeric(name, { precision: 18, scale: 9, mode: "number" });

// Legacy `magnitud` and `categorias.tipo` values are user-visible Spanish data and are kept verbatim.
export const unitMagnitude = pgEnum("unit_magnitude", ["unidad", "volumen", "peso"]);
export const movementCategoryKind = pgEnum("movement_category_kind", ["Ingreso", "Gasto", "Compra"]);

/** Legacy: categorias_producto */
export const productCategories = pgTable(
  "product_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    sequence: integer("sequence").notNull().default(10),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    updatedBy: uuid("updated_by").references(() => users.id),
  },
  (t) => [uniqueIndex("ux_product_categories_name").on(sql`lower(${t.name})`)],
);

/** Legacy: proveedores */
export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    legalName: text("legal_name").notNull().default(""),
    /** CUIT */
    taxId: text("tax_id").notNull().default(""),
    /** Rubro */
    business: text("business").notNull().default(""),
    contact: text("contact").notNull().default(""),
    phone: text("phone").notNull().default(""),
    email: text("email").notNull().default(""),
    address: text("address").notNull().default(""),
    notes: text("notes").notNull().default(""),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    updatedBy: uuid("updated_by").references(() => users.id),
  },
  (t) => [
    uniqueIndex("ux_suppliers_name").on(sql`lower(${t.name})`),
    // Legacy: the CUIT is unique when present (empty = not informed).
    uniqueIndex("ux_suppliers_tax_id").on(t.taxId).where(sql`${t.taxId} <> ''`),
  ],
);

/** Legacy: unidades_medida */
export const units = pgTable("units", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  magnitude: unitMagnitude("magnitude").notNull(),
  baseFactor: decimal("base_factor").notNull().default(1),
  active: boolean("active").notNull().default(true),
});

/** Legacy: metodos_pago */
export const paymentMethods = pgTable("payment_methods", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull().unique(),
  active: boolean("active").notNull().default(true),
  sequence: integer("sequence").notNull().default(10),
});

/** Legacy: categorias (categories of ledger movements: Ingreso / Gasto / Compra). */
export const movementCategories = pgTable("movement_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  kind: movementCategoryKind("kind").notNull(),
  active: boolean("active").notNull().default(true),
});

/**
 * Legacy: productos. Stock is NOT here: it lives in `stock_levels` (inventory module).
 * The legacy denormalized text columns `categoria` / `unidad_stock` are replaced by the FKs (+ the canonical unit code).
 */
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Display number and source of the generated SKU ("P-0001").
    number: integer("number").generatedAlwaysAsIdentity().notNull(),
    name: text("name").notNull().unique(),
    sku: text("sku").notNull().unique(),
    description: text("description").notNull().default(""),
    categoryId: uuid("category_id").notNull().references(() => productCategories.id),
    salePrice: cents("sale_price").notNull().default(0),
    unitCost: cents("unit_cost").notNull().default(0),
    minStock: decimal("min_stock").notNull().default(0),
    active: boolean("active").notNull().default(true),
    isSellable: boolean("is_sellable").notNull().default(true),
    isPurchasable: boolean("is_purchasable").notNull().default(true),
    isSupply: boolean("is_supply").notNull().default(false),
    isCompound: boolean("is_compound").notNull().default(false),
    controlsStock: boolean("controls_stock").notNull().default(true),
    /** Canonical code: unidad | ml | l | g | kg. */
    stockUnit: text("stock_unit").notNull().default("unidad"),
    stockUnitId: uuid("stock_unit_id").notNull().references(() => units.id),
    purchaseUnit: text("purchase_unit").notNull().default("unidad"),
    purchaseFactor: decimal("purchase_factor").notNull().default(1),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    updatedBy: uuid("updated_by").references(() => users.id),
  },
  (t) => [
    check("products_sale_price_non_negative", sql`${t.salePrice} >= 0`),
    check("products_unit_cost_non_negative", sql`${t.unitCost} >= 0`),
    check("products_min_stock_non_negative", sql`${t.minStock} >= 0`),
    check("products_purchase_factor_positive", sql`${t.purchaseFactor} > 0`),
    index("ix_products_active_category").on(t.active, t.categoryId),
    index("ix_products_supplier").on(t.supplierId),
  ],
);
