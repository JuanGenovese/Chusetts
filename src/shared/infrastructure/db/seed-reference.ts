import { sql } from "drizzle-orm";
import type { Database } from "./client";
import { movementCategories, paymentMethods, productCategories, units } from "./schema";

/**
 * Reference data ported from the legacy `database/seeds.py` + `migrations.py` (`seed_relational_catalogs`).
 * Idempotent: safe to run on every deploy; it never overwrites rows an admin may have edited.
 */

export const REFERENCE_UNITS = [
  { code: "unidad", name: "Unidad", magnitude: "unidad", baseFactor: 1 },
  { code: "ml", name: "Mililitro", magnitude: "volumen", baseFactor: 1 },
  { code: "oz", name: "Onza", magnitude: "volumen", baseFactor: 29.5735 },
  { code: "l", name: "Litro", magnitude: "volumen", baseFactor: 1000 },
  { code: "g", name: "Gramo", magnitude: "peso", baseFactor: 1 },
  { code: "gr", name: "Gramo", magnitude: "peso", baseFactor: 1 },
  { code: "kg", name: "Kilogramo", magnitude: "peso", baseFactor: 1000 },
] as const;

/** "Mercado Pago" is the digital payment method (the legacy app had renamed it to "Nave"). */
export const REFERENCE_PAYMENT_METHODS = [
  { code: "EFECTIVO", name: "Efectivo", sequence: 10 },
  { code: "TRANSFERENCIA", name: "Transferencia", sequence: 20 },
  { code: "TARJETA", name: "Tarjeta", sequence: 30 },
  { code: "MERCADO_PAGO", name: "Mercado Pago", sequence: 40 },
  { code: "OTRO", name: "Otro", sequence: 90 },
] as const;

/** Legacy `categorias` (ledger movement categories). */
export const REFERENCE_MOVEMENT_CATEGORIES = [
  { name: "Venta mostrador", kind: "Ingreso" },
  { name: "Venta evento", kind: "Ingreso" },
  { name: "Delivery", kind: "Ingreso" },
  { name: "Alquiler", kind: "Gasto" },
  { name: "Sueldos", kind: "Gasto" },
  { name: "Servicios", kind: "Gasto" },
  { name: "Mercadería", kind: "Gasto" },
  { name: "Descartables", kind: "Gasto" },
  { name: "Impuestos", kind: "Gasto" },
  { name: "Marketing", kind: "Gasto" },
  { name: "Mantenimiento", kind: "Gasto" },
  { name: "Compra cerveza", kind: "Compra" },
  { name: "Compra comida", kind: "Compra" },
  { name: "Compra bebida", kind: "Compra" },
  { name: "Compra insumos", kind: "Compra" },
] as const;

export const DEFAULT_PRODUCT_CATEGORY = "General";

export async function seedReferenceData(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(units).values(REFERENCE_UNITS.map((u) => ({ ...u }))).onConflictDoNothing();
    await tx.insert(paymentMethods).values(REFERENCE_PAYMENT_METHODS.map((m) => ({ ...m }))).onConflictDoNothing();
    await tx.insert(movementCategories).values(REFERENCE_MOVEMENT_CATEGORIES.map((c) => ({ ...c }))).onConflictDoNothing();
    // Legacy: the "General" product category exists when there is no other category source. Only when the table is
    // empty, so an admin who renamed/archived it is not fought on the next run.
    await tx.execute(sql`
      insert into ${productCategories} (name, active, sequence)
      select ${DEFAULT_PRODUCT_CATEGORY}, true, 10
      where not exists (select 1 from ${productCategories})
    `);
  });
}
