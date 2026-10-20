import { asc, desc, eq, getTableColumns, sql, type SQL } from "drizzle-orm";
import { alias, type PgColumn, type PgTable } from "drizzle-orm/pg-core";
import type { Database } from "@/shared/infrastructure/db/client";
import {
  cashEvents,
  cashSessions,
  movementCategories,
  movements,
  passwordEvents,
  products,
  recipeComponents,
  stockLevels,
  stockMovements,
  users,
} from "@/shared/infrastructure/db/schema";
import { USERS_EXPORT_COLUMNS, type ExportTable } from "../domain";
import type { ManagementExportReader } from "../application/ports";

type Selection = Record<string, PgColumn | SQL | SQL.Aliased>;

/** `SELECT *` equivalent keyed by the database column names. */
const allColumns = (table: PgTable): Record<string, PgColumn> =>
  Object.fromEntries(Object.values(getTableColumns(table)).map((column) => [column.name, column]));

/** numeric columns arrive as strings; a spreadsheet wants numbers. */
const numeric = (column: PgColumn) => sql<number>`${column}`.mapWith(Number);

function toTable(selection: Selection, rows: Record<string, unknown>[]): ExportTable {
  return { columns: Object.keys(selection), rows };
}

/** Same as `allColumns`, with `numeric` columns converted to numbers. */
function tableSelection(table: PgTable): Selection {
  return Object.fromEntries(
    Object.values(getTableColumns(table)).map((column) => [column.name, column.columnType === "PgNumeric" ? numeric(column).as(column.name) : column]),
  );
}

/**
 * Reads the ten legacy workbook sources in ONE read-only REPEATABLE READ transaction (like the JSON data export), so a
 * sale landing mid-export cannot leave a ticket without its stock movements. Each query keeps its legacy ORDER BY; the
 * columns are the database column names. Money columns are integer cents, exactly as stored.
 */
export function createManagementExportReader(db: Database): ManagementExportReader {
  return {
    readAll() {
      return db.transaction(
        async (tx) => {
          const movementsSel = tableSelection(movements);
          const movementRows = await tx.select(movementsSel).from(movements).orderBy(desc(movements.businessDate), desc(movements.number));

          // Stock lives in `stock_levels` in the new schema; legacy `productos.stock_actual` is kept as `stock_quantity`.
          const productsSel: Selection = { ...tableSelection(products), stock_quantity: sql<number>`coalesce(${stockLevels.quantity}, 0)`.mapWith(Number).as("stock_quantity") };
          const productRows = await tx.select(productsSel).from(products).leftJoin(stockLevels, eq(stockLevels.productId, products.id)).orderBy(asc(products.name));

          const sessionsSel = tableSelection(cashSessions);
          const closingRows = await tx
            .select(sessionsSel)
            .from(cashSessions)
            .where(eq(cashSessions.status, "CLOSED"))
            .orderBy(desc(cashSessions.businessDate), desc(cashSessions.closedAt), desc(cashSessions.number));

          const categoriesSel = tableSelection(movementCategories);
          const categoryRows = await tx.select(categoriesSel).from(movementCategories).orderBy(asc(movementCategories.kind), asc(movementCategories.name));

          // Whitelist at the query: auth ids never even leave the database.
          const userColumns = allColumns(users);
          const usersSel: Selection = Object.fromEntries(USERS_EXPORT_COLUMNS.map((name) => [name, userColumns[name]]));
          const userRows = await tx.select(usersSel).from(users).orderBy(asc(users.username));

          const sessionRows = await tx.select(sessionsSel).from(cashSessions).orderBy(desc(cashSessions.number));

          const eventsSel = tableSelection(cashEvents);
          const eventRows = await tx.select(eventsSel).from(cashEvents).orderBy(desc(cashEvents.occurredAt), desc(cashEvents.id));

          const passwordSel = tableSelection(passwordEvents);
          const passwordRows = await tx.select(passwordSel).from(passwordEvents).orderBy(desc(passwordEvents.id));

          const sold = alias(products, "sold");
          const component = alias(products, "component");
          const recipesSel: Selection = {
            ...tableSelection(recipeComponents),
            sale_product_name: sold.name,
            component_name: component.name,
            component_stock_unit: component.stockUnit,
          };
          const recipeRows = await tx
            .select(recipesSel)
            .from(recipeComponents)
            .innerJoin(sold, eq(sold.id, recipeComponents.saleProductId))
            .innerJoin(component, eq(component.id, recipeComponents.componentId))
            .orderBy(asc(sold.name), asc(component.name));

          const stockSel = tableSelection(stockMovements);
          const stockRows = await tx.select(stockSel).from(stockMovements).orderBy(desc(stockMovements.sequence));

          return {
            movements: toTable(movementsSel, movementRows),
            products: toTable(productsSel, productRows),
            cashClosings: toTable(sessionsSel, closingRows),
            categories: toTable(categoriesSel, categoryRows),
            users: toTable(usersSel, userRows),
            cashSessions: toTable(sessionsSel, sessionRows),
            cashEvents: toTable(eventsSel, eventRows),
            passwordEvents: toTable(passwordSel, passwordRows),
            recipes: toTable(recipesSel, recipeRows),
            stockMovements: toTable(stockSel, stockRows),
          };
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
  };
}
