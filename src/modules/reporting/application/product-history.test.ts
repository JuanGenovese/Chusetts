import { beforeEach, describe, expect, it } from "vitest";
import type { ProductStockHistoryRow } from "../domain";
import { makeReportingTestDeps } from "./testing/in-memory";
import { reportingUseCases } from "./index";

let t: ReturnType<typeof makeReportingTestDeps>;

const row = (n: number, productId: string): ProductStockHistoryRow & { productId: string } => ({
  productId,
  id: `h-${n}`,
  createdAt: new Date(`2026-08-30T15:00:0${n}Z`),
  type: "AJUSTE_FISICO",
  quantityDelta: n,
  stockBefore: n,
  stockAfter: n + n,
  reason: `motivo ${n}`,
  actorUsername: "admin",
});

beforeEach(() => {
  t = makeReportingTestDeps();
});

describe("listProductStockHistory", () => {
  it("returns the product's stock movements newest first, without other products", async () => {
    t.store.stockHistory.push(row(1, "p1"), row(2, "p1"), row(3, "p2"));
    const history = await reportingUseCases(t.deps).listProductStockHistory({ productId: "p1" });
    expect(history.map((h) => h.id)).toEqual(["h-2", "h-1"]);
    expect(history[0]).toMatchObject({ type: "AJUSTE_FISICO", actorUsername: "admin", reason: "motivo 2" });
  });

  it("limits to the 200 newest rows by default and accepts a custom limit", async () => {
    for (let i = 0; i < 250; i += 1) t.store.stockHistory.push({ ...row(1, "p1"), id: `h-${i}` });
    const use = reportingUseCases(t.deps);
    expect(await use.listProductStockHistory({ productId: "p1" })).toHaveLength(200);
    expect(await use.listProductStockHistory({ productId: "p1", limit: 5 })).toHaveLength(5);
  });
});
