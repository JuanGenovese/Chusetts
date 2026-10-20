import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
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
import { cashSessions } from "./cash";
import { movementCategories, paymentMethods, products, suppliers } from "./catalog";
import { users } from "./users";

// Money columns are INTEGER CENTS (bigint, mode "number").
const cents = (name: string) => bigint(name, { mode: "number" });
// Decimal quantities: numeric(18,9) like the legacy round(x, 9).
const decimal = (name: string) => numeric(name, { precision: 18, scale: 9, mode: "number" });

/** Legacy `movimientos.tipo` values are user-visible Spanish data and are kept verbatim. */
export const movementKind = pgEnum("movement_kind", ["Venta", "Gasto", "Compra", "Ajuste Stock"]);
/** Legacy: ordenes_venta.estado (CONFIRMADA / ANULADA). */
export const saleOrderStatus = pgEnum("sale_order_status", ["CONFIRMED", "VOIDED"]);

/** Legacy: ordenes_venta. One row per sale ticket. */
export const saleOrders = pgTable(
  "sale_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Human ticket id "YYYYMMDD-ABC123". */
    ticketId: text("ticket_id").notNull().unique(),
    businessDate: date("business_date", { mode: "string" }).notNull(),
    cashSessionId: uuid("cash_session_id").references(() => cashSessions.id),
    status: saleOrderStatus("status").notNull().default("CONFIRMED"),
    paymentMethodId: uuid("payment_method_id").references(() => paymentMethods.id),
    total: cents("total").notNull().default(0),
    notes: text("notes").notNull().default(""),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: uuid("voided_by").references(() => users.id),
    voidReason: text("void_reason"),
  },
  (t) => [
    check("sale_orders_total_non_negative", sql`${t.total} >= 0`),
    index("ix_sale_orders_date_user").on(t.businessDate, t.createdBy, t.status),
  ],
);

/**
 * Legacy: movimientos. The ledger of everything that moved money or stock: sale lines, expenses, purchases and
 * "Ajuste Stock" rows. `voided` replaces the legacy `anulada` flag (active = not voided).
 * Free-text columns (`category`, `paymentMethodName`, `supplierName`, `productName`) are snapshots like the legacy ones;
 * the FK columns next to them are the relational links.
 */
export const movements = pgTable(
  "movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Legacy numeric id: display number and insertion order ("newest first" ordering). */
    number: integer("number").generatedAlwaysAsIdentity().notNull(),
    /** Legacy `fecha`: the operating date the movement belongs to. */
    businessDate: date("business_date", { mode: "string" }).notNull(),
    kind: movementKind("kind").notNull(),
    category: text("category"),
    categoryId: uuid("category_id").references(() => movementCategories.id),
    description: text("description").notNull(),
    productId: uuid("product_id").references(() => products.id),
    productName: text("product_name"),
    /** Units sold / bought; the signed stock delta for "Ajuste Stock" rows. */
    quantity: decimal("quantity").notNull().default(0),
    unitPrice: cents("unit_price").notNull().default(0),
    amount: cents("amount").notNull().default(0),
    paymentMethodId: uuid("payment_method_id").references(() => paymentMethods.id),
    paymentMethodName: text("payment_method_name"),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    supplierName: text("supplier_name").notNull().default(""),
    notes: text("notes").notNull().default(""),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    voided: boolean("voided").notNull().default(false),
    voidReason: text("void_reason"),
    voidedBy: uuid("voided_by").references(() => users.id),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    ticketId: text("ticket_id"),
    cashSessionId: uuid("cash_session_id").references(() => cashSessions.id),
    saleOrderId: uuid("sale_order_id").references(() => saleOrders.id),
  },
  (t) => [
    check("movements_amount_non_negative", sql`${t.amount} >= 0`),
    index("ix_movements_date_kind").on(t.businessDate, t.kind),
    index("ix_movements_ticket").on(t.ticketId),
    index("ix_movements_cash_session").on(t.cashSessionId),
    index("ix_movements_number").on(t.number),
  ],
);

/** Legacy: lineas_orden_venta. `movementId` is the ledger "Venta" row of the line (one-to-one). */
export const saleOrderLines = pgTable(
  "sale_order_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull().references(() => saleOrders.id),
    sequence: integer("sequence").notNull().default(10),
    productId: uuid("product_id").references(() => products.id),
    productName: text("product_name").notNull(),
    quantity: decimal("quantity").notNull(),
    unitPrice: cents("unit_price").notNull().default(0),
    subtotal: cents("subtotal").notNull().default(0),
    movementId: uuid("movement_id").references(() => movements.id),
  },
  (t) => [
    check("sale_order_lines_quantity_positive", sql`${t.quantity} > 0`),
    uniqueIndex("ux_sale_order_lines_movement").on(t.movementId),
    index("ix_sale_order_lines_order").on(t.orderId, t.sequence, t.id),
  ],
);
