import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import postgres from "postgres";
import { readLegacy } from "./legacy-reader";
import { LegacyDataError } from "./mapping";
import { renderReport } from "./report";
import { runImport } from "./run-import";

/**
 * One-shot legacy -> Postgres importer. Deliberately does NOT load .env files: the target comes only from the process
 * environment (DIRECT_DATABASE_URL, else DATABASE_URL) and must be confirmed with --target <host>.
 */
const USAGE = `Usage: pnpm db:import-legacy --legacy-db <upgraded.sqlite> --target <db-host> [--replace] [--dry-run] [--report <file.md>]

Env: DIRECT_DATABASE_URL (preferred) or DATABASE_URL. --target must equal that URL's hostname.`;

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      "legacy-db": { type: "string" },
      target: { type: "string" },
      replace: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      report: { type: "string" },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (!values["legacy-db"] || !values.target) {
    console.error(USAGE);
    return 2;
  }
  const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  const urlVar = process.env.DIRECT_DATABASE_URL ? "DIRECT_DATABASE_URL" : "DATABASE_URL";
  if (!url) {
    console.error("Set DIRECT_DATABASE_URL (or DATABASE_URL) explicitly in the environment. .env files are not read by this tool.");
    return 2;
  }
  const parsed = new URL(url);
  if (parsed.hostname.toLowerCase() !== values.target.trim().toLowerCase()) {
    console.error(`REFUSING: --target "${values.target}" does not match the host of ${urlVar} ("${parsed.hostname}"). Nothing was connected or written.`);
    return 2;
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const targetLabel = `${parsed.hostname}:${parsed.port || "5432"}/${database} (user ${decodeURIComponent(parsed.username)}, from ${urlVar})`;
  const mode = [values.replace ? "replace" : "fresh-only", values["dry-run"] ? "dry-run (rolls back)" : "commit"].join(", ");
  console.log(`Target: ${targetLabel}\nMode:   ${mode}\nLegacy: ${resolve(values["legacy-db"])}`);

  const legacy = readLegacy(resolve(values["legacy-db"]));
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  const startedAt = new Date().toISOString();
  try {
    const run = await runImport(sql, legacy, {
      replace: values.replace,
      dryRun: values["dry-run"],
    });
    const report = renderReport({ target: targetLabel, mode, legacyPath: resolve(values["legacy-db"]), startedAt }, run, run.reconciliation, legacy.ignoredCounts);
    const reportPath = resolve(values.report ?? "import-legacy-report.md");
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, report);
    writeFileSync(reportPath.replace(/\.md$/, "") + ".id-map.json", JSON.stringify(run.plan.idMap, null, 2));

    console.log("\nEntity counts (legacy -> imported)");
    for (const c of run.reconciliation.counts) console.log(`  ${c.legacy === c.imported ? "OK      " : "MISMATCH"} ${c.entity}: ${c.legacy} -> ${c.imported}`);
    const all = run.reconciliation.actual.all;
    console.log(`\nMovements: ${all.n} rows, active ${all.active / 100} ARS, voided ${all.voidedN} rows / ${all.voided / 100} ARS`);
    console.log(`Report: ${reportPath}`);
    if (run.reconciliation.mismatches.length) {
      console.error(`\nRECONCILIATION FAILED, transaction rolled back (${run.reconciliation.mismatches.length} mismatches):`);
      for (const m of run.reconciliation.mismatches.slice(0, 20)) console.error(`  - ${m}`);
      return 1;
    }
    console.log(run.committed ? "\nCOMMITTED. Reconciliation OK." : "\nDRY RUN: reconciliation OK, rolled back (nothing persisted).");
    return 0;
  } catch (error) {
    if (error instanceof LegacyDataError) {
      console.error(`\nREFUSED / FAILED (nothing was written): ${error.message}`);
      return 1;
    }
    throw error;
  } finally {
    await sql.end();
  }
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
