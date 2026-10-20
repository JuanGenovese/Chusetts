import type postgres from "postgres";
import { flag, num, str, type LegacyData } from "./legacy-reader";
import { mapPaymentMethod, pesosToCents, toDecimal } from "./mapping";
import type { MovementCategoryPlan, Plan } from "./build-plan";

type Tx = postgres.TransactionSql;

export interface CountRow {
  entity: string;
  legacy: number;
  imported: number;
}

export interface Agg {
  n: number;
  /** Amount of NON-voided rows, in cents. */
  active: number;
  voidedN: number;
  voided: number;
}

export type Dim = Record<string, Agg>;

export interface Aggregates {
  byKind: Dim;
  byPayment: Dim;
  byMonth: Dim;
  byDay: Dim;
  all: Agg;
}

export interface StockRow {
  product: string;
  legacy: number;
  imported: number;
}

export interface TicketSummary {
  total: number;
  confirmed: number;
  voided: number;
  activeSum: number;
}

export interface Reconciliation {
  counts: CountRow[];
  expected: Aggregates;
  actual: Aggregates;
  tickets: { legacy: TicketSummary; imported: TicketSummary; legacyOrders: TicketSummary };
  stock: StockRow[];
  mismatches: string[];
}

const empty = (): Agg => ({ n: 0, active: 0, voidedN: 0, voided: 0 });

function add(dim: Dim, key: string, cents: number, voided: boolean) {
  const a = (dim[key] ??= empty());
  a.n += 1;
  if (voided) {
    a.voidedN += 1;
    a.voided += cents;
  } else a.active += cents;
}

export function expectedAggregates(legacy: LegacyData): Aggregates {
  const out: Aggregates = { byKind: {}, byPayment: {}, byMonth: {}, byDay: {}, all: empty() };
  for (const m of legacy.movimientos) {
    const cents = pesosToCents(num(m.importe), `movement ${String(m.id)}`);
    const voided = flag(m.anulada);
    const fecha = String(m.fecha);
    add(out.byKind, String(m.tipo), cents, voided);
    add(out.byPayment, mapPaymentMethod(str(m.medio_pago))?.name ?? "(none)", cents, voided);
    add(out.byMonth, fecha.slice(0, 7), cents, voided);
    add(out.byDay, fecha, cents, voided);
    const all = out.all;
    all.n += 1;
    if (voided) { all.voidedN += 1; all.voided += cents; } else all.active += cents;
  }
  return out;
}

async function groupSql(tx: Tx, keyExpr: string): Promise<Dim> {
  const rows = await tx.unsafe(
    `select ${keyExpr} as k, count(*)::int as n,
            coalesce(sum(amount) filter (where not voided), 0)::text as active,
            (count(*) filter (where voided))::int as voided_n,
            coalesce(sum(amount) filter (where voided), 0)::text as voided
     from movements group by 1`,
  );
  const dim: Dim = {};
  for (const r of rows) dim[String(r.k)] = { n: Number(r.n), active: Number(r.active), voidedN: Number(r.voided_n), voided: Number(r.voided) };
  return dim;
}

async function actualAggregates(tx: Tx): Promise<Aggregates> {
  const all = await groupSql(tx, "'all'");
  return {
    byKind: await groupSql(tx, "kind::text"),
    byPayment: await groupSql(tx, "coalesce(payment_method_name, '(none)')"),
    byMonth: await groupSql(tx, "to_char(business_date, 'YYYY-MM')"),
    byDay: await groupSql(tx, "business_date::text"),
    all: all["all"] ?? empty(),
  };
}

function diffDims(label: string, expected: Dim, actual: Dim, out: string[]) {
  for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    const e = expected[key] ?? empty();
    const a = actual[key] ?? empty();
    if (e.n !== a.n || e.active !== a.active || e.voidedN !== a.voidedN || e.voided !== a.voided) {
      out.push(`${label} ${key}: legacy ${JSON.stringify(e)} vs imported ${JSON.stringify(a)}`);
    }
  }
}

const count = async (tx: Tx, table: string): Promise<number> => Number((await tx.unsafe(`select count(*)::int as n from ${table}`))[0].n);

export interface ReconcileInput {
  legacy: LegacyData;
  plan: Plan;
  categoryPlan: MovementCategoryPlan;
  /** product_categories rows that existed in the target before the import and are reused. */
  referenceNames: { productCategories: string[]; paymentMethods: string[]; units: string[]; movementCategories: string[] };
}

export async function reconcile(tx: Tx, input: ReconcileInput): Promise<Reconciliation> {
  const { legacy, plan, referenceNames } = input;
  const mismatches: string[] = [];

  const named = async (table: string, column: string, names: string[], lower = false): Promise<number> =>
    Number((await tx.unsafe(`select count(*)::int as n from ${table} where ${lower ? `lower(${column})` : column} = any($1)`, [names]))[0].n);

  // Legacy ids are kept as `movements.number`: compare the exact id sets.
  const idMatch = Number(
    (await tx.unsafe("select count(*)::int as n from movements where number = any($1)", [legacy.movimientos.map((m) => m.id as number)]))[0].n,
  );

  const counts: CountRow[] = [
    { entity: "users", legacy: legacy.users.length, imported: await count(tx, "users") },
    { entity: "movement_categories (supported kinds)", legacy: referenceNames.movementCategories.length, imported: await named("movement_categories", "name", referenceNames.movementCategories) },
    { entity: "product_categories", legacy: referenceNames.productCategories.length, imported: await named("product_categories", "name", referenceNames.productCategories, true) },
    { entity: "suppliers", legacy: legacy.proveedores.length, imported: await count(tx, "suppliers") },
    { entity: "units (matched seeded)", legacy: legacy.unidades.length, imported: await named("units", "code", legacy.unidades.map((u) => String(u.codigo))) },
    { entity: "payment_methods (matched seeded)", legacy: referenceNames.paymentMethods.length, imported: await named("payment_methods", "name", referenceNames.paymentMethods) },
    { entity: "products", legacy: legacy.productos.length, imported: await count(tx, "products") },
    { entity: "stock_levels (non-zero stock)", legacy: legacy.productos.filter((p) => toDecimal(num(p.stock_actual), "s") !== 0).length, imported: await count(tx, "stock_levels") },
    { entity: "recipe_components", legacy: legacy.recetas.length, imported: await count(tx, "recipe_components") },
    { entity: "movements", legacy: legacy.movimientos.length, imported: await count(tx, "movements") },
    { entity: "movements whose number = legacy id", legacy: legacy.movimientos.length, imported: idMatch },
    { entity: "sale_orders (tickets)", legacy: new Set(legacy.movimientos.filter((m) => m.tipo === "Venta" && str(m.ticket_id)?.trim()).map((m) => String(m.ticket_id).trim())).size, imported: await count(tx, "sale_orders") },
    { entity: "sale_order_lines", legacy: legacy.movimientos.filter((m) => m.tipo === "Venta" && str(m.ticket_id)?.trim()).length, imported: await count(tx, "sale_order_lines") },
    { entity: "cash_sessions", legacy: legacy.unsupportedCounts.turnos_caja, imported: await count(tx, "cash_sessions") },
    { entity: "cash_movements", legacy: legacy.unsupportedCounts.movimientos_caja, imported: await count(tx, "cash_movements") },
    { entity: "cash_events", legacy: legacy.unsupportedCounts.eventos_turno_caja, imported: await count(tx, "cash_events") },
    { entity: "stock_movements", legacy: legacy.unsupportedCounts.movimientos_stock, imported: await count(tx, "stock_movements") },
  ];
  for (const c of counts) if (c.legacy !== c.imported) mismatches.push(`count ${c.entity}: legacy ${c.legacy} vs imported ${c.imported}`);

  const expected = expectedAggregates(legacy);
  const actual = await actualAggregates(tx);
  diffDims("by kind", expected.byKind, actual.byKind, mismatches);
  diffDims("by payment method", expected.byPayment, actual.byPayment, mismatches);
  diffDims("by month", expected.byMonth, actual.byMonth, mismatches);
  diffDims("by day", expected.byDay, actual.byDay, mismatches);
  if (JSON.stringify(expected.all) !== JSON.stringify(actual.all)) mismatches.push(`grand total: legacy ${JSON.stringify(expected.all)} vs imported ${JSON.stringify(actual.all)}`);

  const fkMismatch = Number(
    (await tx.unsafe(`select count(*)::int as n from movements m join payment_methods p on p.id = m.payment_method_id where p.name <> m.payment_method_name`))[0].n,
  );
  if (fkMismatch) mismatches.push(`${fkMismatch} movements whose payment_method_id name differs from the snapshot name`);

  // Tickets: legacy upgraded ordenes_venta vs our grouping vs what was imported.
  const summarizeLegacyOrders = (): TicketSummary => ({
    total: legacy.ordenesVenta.length,
    confirmed: legacy.ordenesVenta.filter((o) => o.estado === "CONFIRMADA").length,
    voided: legacy.ordenesVenta.filter((o) => o.estado === "ANULADA").length,
    activeSum: legacy.ordenesVenta.reduce((s, o) => s + pesosToCents(num(o.total), "order total"), 0),
  });
  const ord = (await tx.unsafe(
    `select count(*)::int as total, (count(*) filter (where status = 'CONFIRMED'))::int as confirmed,
            (count(*) filter (where status = 'VOIDED'))::int as voided, coalesce(sum(total), 0)::text as sum from sale_orders`,
  ))[0];
  const imported: TicketSummary = { total: Number(ord.total), confirmed: Number(ord.confirmed), voided: Number(ord.voided), activeSum: Number(ord.sum) };
  const legacyOrders = summarizeLegacyOrders();
  const planned: TicketSummary = {
    total: plan.saleOrders.length,
    confirmed: plan.saleOrders.filter((o) => o.status === "CONFIRMED").length,
    voided: plan.saleOrders.filter((o) => o.status === "VOIDED").length,
    activeSum: plan.saleOrders.reduce((s, o) => s + Number(o.total), 0),
  };
  for (const [name, other] of [["legacy ordenes_venta", legacyOrders], ["planned grouping", planned]] as const) {
    if (JSON.stringify(other) !== JSON.stringify(imported)) mismatches.push(`tickets: ${name} ${JSON.stringify(other)} vs imported ${JSON.stringify(imported)}`);
  }
  if (imported.activeSum !== expected.byKind["Venta"]?.active) mismatches.push(`sale_orders total ${imported.activeSum} != active Venta amount ${expected.byKind["Venta"]?.active}`);
  const orphanLines = Number((await tx.unsafe(`select count(*)::int as n from movements where kind = 'Venta' and sale_order_id is null`))[0].n);
  if (orphanLines) mismatches.push(`${orphanLines} Venta movements without sale order`);

  // Stock per product.
  const stockRows = await tx.unsafe(
    `select p.id, p.name, coalesce(s.quantity, 0)::float8 as q from products p left join stock_levels s on s.product_id = p.id order by p.number`,
  );
  const expectedStock = new Map(plan.products.map((p) => [String(p.id), toDecimal(num(legacy.productos.find((l) => plan.idMap.products[String(l.id)] === p.id)?.stock_actual), "stock")]));
  const stock: StockRow[] = stockRows.map((r) => ({ product: String(r.name), legacy: expectedStock.get(String(r.id)) ?? NaN, imported: Number(r.q) }));
  for (const s of stock) if (!(Math.abs(s.legacy - s.imported) < 1e-9)) mismatches.push(`stock ${s.product}: legacy ${s.legacy} vs imported ${s.imported}`);
  if (stock.length !== legacy.productos.length) mismatches.push(`stock rows ${stock.length} != products ${legacy.productos.length}`);

  return { counts, expected, actual, tickets: { legacy: planned, imported, legacyOrders }, stock, mismatches };
}
