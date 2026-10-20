import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDbConnection, type DbConnection } from "./client";
import {
  REFERENCE_MOVEMENT_CATEGORIES,
  REFERENCE_PAYMENT_METHODS,
  REFERENCE_UNITS,
  seedReferenceData,
} from "./seed-reference";
import { movementCategories, paymentMethods, productCategories, units } from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  console.warn("[integration] DATABASE_URL is not set: skipping seed integration tests.");
}

describe.skipIf(!url)("reference data seed", () => {
  let conn: DbConnection;
  beforeAll(() => {
    conn = createDbConnection(url!, { max: 2 });
  });
  afterAll(async () => {
    await conn.close();
  });

  const counts = async () => ({
    units: (await conn.db.select().from(units)).length,
    paymentMethods: (await conn.db.select().from(paymentMethods)).length,
    movementCategories: (await conn.db.select().from(movementCategories)).length,
    productCategories: (await conn.db.select().from(productCategories)).length,
  });

  it("is idempotent", async () => {
    await seedReferenceData(conn.db);
    const first = await counts();
    await seedReferenceData(conn.db);
    expect(await counts()).toEqual(first);
    expect(first.units).toBeGreaterThanOrEqual(REFERENCE_UNITS.length);
    expect(first.paymentMethods).toBeGreaterThanOrEqual(REFERENCE_PAYMENT_METHODS.length);
    expect(first.movementCategories).toBeGreaterThanOrEqual(REFERENCE_MOVEMENT_CATEGORIES.length);
    expect(first.productCategories).toBeGreaterThanOrEqual(1);
  });

  it("seeds the legacy codes", async () => {
    const [nave] = (await conn.db.select().from(paymentMethods)).filter((m) => m.code === "NAVE");
    expect(nave).toMatchObject({ name: "Nave", sequence: 40, active: true });
    expect((await conn.db.select().from(units)).map((u) => u.code)).toEqual(expect.arrayContaining(["unidad", "ml", "oz", "l", "g", "gr", "kg"]));
  });
});
