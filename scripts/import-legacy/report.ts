import type { Agg, Dim, Reconciliation } from "./reconcile";
import type { RunResult } from "./run-import";

const pesos = (cents: number) => (cents / 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const aggCell = (a: Agg | undefined) => (a ? `${a.n} / ${pesos(a.active)} / ${a.voidedN} / ${pesos(a.voided)}` : "-");

function dimTable(title: string, expected: Dim, actual: Dim): string {
  const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
  const rows = keys.map((k) => {
    const same = JSON.stringify(expected[k]) === JSON.stringify(actual[k]);
    return `| ${k} | ${aggCell(expected[k])} | ${aggCell(actual[k])} | ${same ? "OK" : "MISMATCH"} |`;
  });
  return [`### ${title}`, "", "Cells: rows / active amount ARS / voided rows / voided amount ARS", "", "| Key | Legacy | Imported | |", "|---|---|---|---|", ...rows, ""].join("\n");
}

export interface ReportContext {
  target: string;
  mode: string;
  legacyPath: string;
  startedAt: string;
}

export function renderReport(ctx: ReportContext, run: RunResult, rec: Reconciliation, ignored: Record<string, number>): string {
  const ok = rec.mismatches.length === 0;
  const lines: string[] = [
    "# Legacy import reconciliation",
    "",
    `- Result: **${ok ? (run.committed ? "OK - committed" : "OK - rolled back (dry run)") : "MISMATCH - rolled back"}**`,
    `- Target: ${ctx.target}`,
    `- Mode: ${ctx.mode}`,
    `- Legacy file: ${ctx.legacyPath}`,
    `- Started: ${ctx.startedAt}`,
    "",
    "## Entity counts",
    "",
    "| Entity | Legacy | Imported | |",
    "|---|---:|---:|---|",
    ...rec.counts.map((c) => `| ${c.entity} | ${c.legacy} | ${c.imported} | ${c.legacy === c.imported ? "OK" : "MISMATCH"} |`),
    "",
    "## Sales and movements",
    "",
    `Grand total: legacy ${aggCell(rec.expected.all)} vs imported ${aggCell(rec.actual.all)}`,
    "",
    dimTable("By movement type", rec.expected.byKind, rec.actual.byKind),
    dimTable("By payment method", rec.expected.byPayment, rec.actual.byPayment),
    dimTable("By month", rec.expected.byMonth, rec.actual.byMonth),
    dimTable("By day", rec.expected.byDay, rec.actual.byDay),
    "## Tickets",
    "",
    "| Source | Tickets | Confirmed | Voided | Sum of totals ARS |",
    "|---|---:|---:|---:|---:|",
    ...(["legacyOrders", "legacy", "imported"] as const).map((k) => {
      const t = rec.tickets[k];
      const label = k === "legacyOrders" ? "legacy ordenes_venta" : k === "legacy" ? "importer grouping" : "imported sale_orders";
      return `| ${label} | ${t.total} | ${t.confirmed} | ${t.voided} | ${pesos(t.activeSum)} |`;
    }),
    "",
    "## Stock per product",
    "",
    "| Product | Legacy stock_actual | Imported stock_levels | |",
    "|---|---:|---:|---|",
    ...rec.stock.map((s) => `| ${s.product} | ${s.legacy} | ${s.imported} | ${Math.abs(s.legacy - s.imported) < 1e-9 ? "OK" : "MISMATCH"} |`),
    "",
    "## Skipped / altered / assumed",
    "",
    ...(run.skippedCategories.length ? run.skippedCategories.map((c) => `- SKIPPED movement category "${c.name}" (${c.kind}): ${c.reason}`) : ["- no skipped movement categories"]),
    ...run.plan.notes.map((n) => `- ${n}`),
    `- movement categories inserted: ${run.categoriesInserted}; \`active\` flag mirrored on ${run.categoriesActiveUpdated} existing ones`,
    ...Object.entries(ignored).map(([t, n]) => `- legacy table \`${t}\` intentionally not imported (${n} rows)`),
    ...(Object.keys(run.replaced).length ? [`- --replace truncated: ${Object.entries(run.replaced).map(([t, n]) => `${t}=${n}`).join(", ")}`] : []),
    "",
    "## Mismatches",
    "",
    ...(ok ? ["none"] : rec.mismatches.map((m) => `- ${m}`)),
    "",
  ];
  return lines.join("\n");
}
