import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { products } from "./catalog";
import { movements } from "./ledger";
import { users } from "./users";

const decimal = (name: string) => numeric(name, { precision: 18, scale: 9, mode: "number" });

/** Current stock per product (legacy: productos.stock_actual). No row = 0. May go negative only through a reversal, like the legacy. */
export const stockLevels = pgTable("stock_levels", {
  productId: uuid("product_id").primaryKey().references(() => products.id),
  quantity: decimal("quantity").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id),
});

/** Legacy: recetas_producto. `quantity` is in `unit`; `stockQuantity` is the same amount in the component's stock unit. */
export const recipeComponents = pgTable(
  "recipe_components",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    saleProductId: uuid("sale_product_id").notNull().references(() => products.id),
    componentId: uuid("component_id").notNull().references(() => products.id),
    quantity: decimal("quantity").notNull(),
    unit: text("unit").notNull(),
    stockQuantity: decimal("stock_quantity").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").notNull().references(() => users.id),
  },
  (t) => [
    uniqueIndex("ux_recipe_components_pair").on(t.saleProductId, t.componentId),
    check("recipe_components_quantity_positive", sql`${t.quantity} > 0`),
    check("recipe_components_not_self", sql`${t.saleProductId} <> ${t.componentId}`),
    index("ix_recipe_components_component").on(t.componentId),
  ],
);

/**
 * Legacy: movimientos_stock. Append-only audit of every stock change.
 * `movementId` references the ledger movement that caused it (sale line, purchase, adjustment); the ledger module owns
 * that table, so a ledger row is always inserted BEFORE the stock audit row that points at it.
 */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Insertion order (history is shown newest first).
    sequence: bigint("sequence", { mode: "number" }).generatedAlwaysAsIdentity().notNull(),
    movementId: uuid("movement_id").notNull().references(() => movements.id),
    productId: uuid("product_id").notNull().references(() => products.id),
    quantityDelta: decimal("quantity_delta").notNull(),
    /** Legacy codes: CONSUMO_VENTA, MOVIMIENTO_DIRECTO, AJUSTE_FISICO, INGRESO_COMPRA, AJUSTE_ADMIN. */
    type: text("type").notNull(),
    reason: text("reason").notNull(),
    stockBefore: decimal("stock_before").notNull(),
    stockAfter: decimal("stock_after").notNull(),
    actorId: uuid("actor_id").notNull().references(() => users.id),
    referenceType: text("reference_type").notNull(),
    referenceId: text("reference_id").notNull(),
    originKey: text("origin_key").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    reverted: boolean("reverted").notNull().default(false),
    revertedAt: timestamp("reverted_at", { withTimezone: true }),
    revertedBy: uuid("reverted_by").references(() => users.id),
  },
  (t) => [
    index("ix_stock_movements_movement").on(t.movementId, t.reverted),
    index("ix_stock_movements_product").on(t.productId, t.sequence),
  ],
);
