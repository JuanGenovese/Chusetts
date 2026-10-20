/**
 * `pnpm db:seed:demo` - realistic demo data for the "/" screens, created ONLY through the use cases (catalog, ledger,
 * cash), so every invariant (stock, cash movements, ledger rows) is the real one.
 *
 *   pnpm db:seed:demo            idempotent: does nothing when the demo data is already there ("Pinta IPA" exists)
 *   pnpm db:seed:demo -- --reset TRUNCATEs catalog/stock/ledger/cash data (NOT users or reference data) and seeds again
 *
 * Local development only: refuses to run against a non-local DATABASE_URL.
 */
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { createDbConnection, requireDatabaseUrl } from "@/shared/infrastructure/db/client";
import { seedReferenceData } from "@/shared/infrastructure/db/seed-reference";
import { users } from "@/shared/infrastructure/db/schema";
import { LOCAL_SEED_ADMIN } from "@/shared/infrastructure/db/local-seed-users";

config({ path: ".env.local" });
config({ path: ".env" });

const TABLES = [
  "cash_events",
  "cash_movements",
  "cash_sessions",
  "stock_movements",
  "recipe_components",
  "stock_levels",
  "sale_order_lines",
  "sale_orders",
  "movements",
  "products",
  "suppliers",
  "product_categories",
];

const pesos = (n: number) => n * 100;

function shiftDate(isoDate: string, days: number, floor: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  const shifted = d.toISOString().slice(0, 10);
  return shifted < floor ? floor : shifted;
}

async function main() {
  const url = requireDatabaseUrl();
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error("db:seed:demo only runs against a local database.");
  const reset = process.argv.includes("--reset");

  const { db, close } = createDbConnection(url, { max: 1 });
  try {
    await db
      .insert(users)
      .values({ id: LOCAL_SEED_ADMIN.id, username: LOCAL_SEED_ADMIN.username, displayName: LOCAL_SEED_ADMIN.displayName, role: "admin" })
      .onConflictDoNothing();
    if (reset) {
      await db.execute(sql.raw(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`));
      console.log("Catalog, stock, ledger and cash data truncated.");
    }
    await seedReferenceData(db);
  } finally {
    await close();
  }

  // Composition (and its DB client) is imported after the env is loaded.
  const { cashUseCases, catalogUseCases, ledgerUseCases } = await import("./composition");
  const catalog = catalogUseCases();
  const ledger = ledgerUseCases();
  const cash = cashUseCases();
  const actor = { id: LOCAL_SEED_ADMIN.id, role: "admin" as const };

  if ((await catalog.listProducts({ includeInactive: true })).some((p) => p.name === "Pinta IPA")) {
    console.log("Demo data already present (use `pnpm db:seed:demo -- --reset` to rebuild it).");
    return;
  }

  const category = async (name: string, sequence: number) =>
    (await catalog.createProductCategory({ name, sequence, actorId: actor.id })).id;
  const cats = {
    draft: await category("Cerveza tirada", 20),
    soft: await category("Bebidas Chicas", 30),
    food: await category("Comida", 40),
    drinks: await category("Tragos", 50),
    supplies: await category("Insumos", 60),
  };
  const supplier = await catalog.createSupplier({ name: "Distribuidora Norte", business: "Bebidas", actorId: actor.id });

  const supply = async (name: string, unit: string, stock: number, cost: number) =>
    (
      await catalog.createProduct({
        name, categoryId: cats.supplies, isSellable: false, isPurchasable: true, isSupply: true, controlsStock: true,
        stockUnit: unit, initialStock: stock, unitCost: pesos(cost), supplierId: supplier.id, actorId: actor.id,
      })
    ).product.id;
  const barrel = await supply("Barril IPA", "l", 40, 4);
  const fernet = await supply("Fernet", "ml", 3000, 0);
  const cola = await supply("Coca", "ml", 12000, 0);

  const sellable = (input: Omit<Parameters<typeof catalog.createProduct>[0], "actorId">) => catalog.createProduct({ ...input, actorId: actor.id });
  const ipa = await sellable({ name: "Pinta IPA", categoryId: cats.draft, salePrice: pesos(4500), isPurchasable: false, recipe: [{ componentId: barrel, quantity: 0.5, unit: "l" }] });
  const fernetCola = await sellable({
    name: "Fernet con coca", categoryId: cats.drinks, salePrice: pesos(6500), isPurchasable: false,
    recipe: [{ componentId: fernet, quantity: 70, unit: "ml" }, { componentId: cola, quantity: 230, unit: "ml" }],
  });
  const water = await sellable({ name: "Agua mineral", categoryId: cats.soft, salePrice: pesos(1800), initialStock: 24, minStock: 6, unitCost: pesos(700) });
  const pizza = await sellable({ name: "Pizza muzza", categoryId: cats.food, salePrice: pesos(7800), initialStock: 12, minStock: 4, unitCost: pesos(3200) });
  await sellable({ name: "Lata Stout", categoryId: cats.soft, salePrice: pesos(3200), initialStock: 4, minStock: 5, unitCost: pesos(1500) });
  await sellable({ name: "Papas fritas", categoryId: cats.food, salePrice: pesos(4200), initialStock: 0, minStock: 3, unitCost: pesos(1200) });

  const session = await cash.openCashSession({ userId: actor.id, openingCash: pesos(10000), notes: "Demo" });
  const today = session.businessDate;
  const monthStart = `${today.slice(0, 8)}01`;

  // Tickets of the day (cash and Nave).
  await ledger.registerSaleTicket({ actor, paymentMethod: "Efectivo", lines: [{ productId: ipa.product.id, quantity: 2 }, { productId: water.product.id, quantity: 1 }] });
  await ledger.registerSaleTicket({ actor, paymentMethod: "Nave", lines: [{ productId: pizza.product.id, quantity: 1 }] });
  await ledger.registerSaleTicket({ actor, paymentMethod: "Nave", lines: [{ productId: fernetCola.product.id, quantity: 2 }] });

  // Earlier days of the month (administrative sales) so "Ventas por día" has several bars.
  for (const [days, product, qty] of [[-2, ipa, 6], [-5, fernetCola, 4], [-9, pizza, 3]] as const) {
    const businessDate = shiftDate(today, days, monthStart);
    if (businessDate === today) continue;
    await ledger.registerAdminSale({
      actor, businessDate, description: product.product.name, productId: product.product.id,
      quantity: qty, unitPrice: product.product.salePrice, paymentMethod: "Nave",
    });
  }

  await ledger.registerExpense({ actor, businessDate: today, description: "Electricidad octubre", category: "Servicios", amount: pesos(25000), paymentMethod: "Nave" });
  await ledger.registerExpense({ actor, businessDate: shiftDate(today, -4, monthStart), description: "Alquiler del local", category: "Alquiler", amount: pesos(120000), paymentMethod: "Transferencia" });
  await ledger.registerPurchase({
    actor, businessDate: today, description: "Barril IPA 30 L", category: "Compra cerveza", productId: barrel,
    supplierId: supplier.id, quantity: 2, unitCost: pesos(8000), paymentMethod: "Efectivo",
  });

  console.log("Demo data seeded: 5 categories, 9 products (3 supplies), 3 tickets today, 1 open cash session.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
