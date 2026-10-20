import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { LegacyDataError } from "./mapping";

/**
 * Reads the UPGRADED legacy SQLite (output of the legacy app's own init_db migrations) strictly read-only.
 * node:sqlite is used instead of better-sqlite3: no native build step (pnpm blocks postinstall builds here), no new
 * dependency to pin, and the importer is a one-shot local tool; the engine version is pinned by the Node runtime.
 */

type Row = Record<string, unknown>;

export interface LegacyData {
  users: Row[];
  categorias: Row[];
  categoriasProducto: Row[];
  proveedores: Row[];
  unidades: Row[];
  metodosPago: Row[];
  productos: Row[];
  recetas: Row[];
  movimientos: Row[];
  ordenesVenta: Row[];
  /** Tables the importer does not support yet; counts must be zero or the run aborts. */
  unsupportedCounts: Record<string, number>;
  /** Tables intentionally never imported (ephemeral or not part of the new model). */
  ignoredCounts: Record<string, number>;
}

const REQUIRED_TABLES = [
  "users", "categorias", "categorias_producto", "proveedores", "unidades_medida", "metodos_pago", "productos",
  "recetas_producto", "movimientos", "ordenes_venta", "turnos_caja", "movimientos_caja", "eventos_turno_caja",
  "movimientos_stock", "cierres_caja", "settings",
];

export function readLegacy(path: string): LegacyData {
  if (!existsSync(path)) throw new LegacyDataError(`Legacy database not found: ${path}`);
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const have = new Set(db.prepare("select name from sqlite_master where type = 'table'").all().map((r) => String(r.name)));
    const missing = REQUIRED_TABLES.filter((t) => !have.has(t));
    if (missing.length) {
      throw new LegacyDataError(`Legacy database is not upgraded (missing tables: ${missing.join(", ")}). Run the legacy init_db migrations on a COPY first.`);
    }
    const all = (sql: string) => db.prepare(sql).all();
    const count = (table: string) => Number(db.prepare(`select count(*) as n from ${table}`).get()?.n ?? 0);
    return {
      users: all("select * from users order by id"),
      categorias: all("select * from categorias order by id"),
      categoriasProducto: all("select * from categorias_producto order by id"),
      proveedores: all("select * from proveedores order by id"),
      unidades: all("select * from unidades_medida order by id"),
      metodosPago: all("select * from metodos_pago order by id"),
      productos: all("select * from productos order by id"),
      recetas: all("select * from recetas_producto order by id"),
      movimientos: all("select * from movimientos order by id"),
      ordenesVenta: all("select * from ordenes_venta order by id"),
      unsupportedCounts: {
        turnos_caja: count("turnos_caja"),
        movimientos_caja: count("movimientos_caja"),
        eventos_turno_caja: count("eventos_turno_caja"),
        movimientos_stock: count("movimientos_stock"),
        cierres_caja: count("cierres_caja"),
        settings: count("settings"),
        "movimientos.turno_caja_id not null": Number(db.prepare("select count(*) as n from movimientos where turno_caja_id is not null").get()?.n ?? 0),
      },
      ignoredCounts: {
        sessions: have.has("sessions") ? count("sessions") : 0,
        eventos_password: have.has("eventos_password") ? count("eventos_password") : 0,
      },
    };
  } finally {
    db.close();
  }
}

export const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
export const num = (v: unknown): number => (typeof v === "number" ? v : Number(v));
export const flag = (v: unknown): boolean => Number(v) !== 0;
