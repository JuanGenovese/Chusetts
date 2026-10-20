/**
 * The application-wide set of repositories: ONE factory builds every module's repositories on the SAME Drizzle
 * transaction handle, so a single `uow.run` can write cash + catalog + inventory + ledger atomically.
 * Modules never import each other's internals: cross-module collaboration happens here, through public APIs.
 */
import type { IdGenerator, Clock } from "@/shared/application/runtime";
import type { DbExecutor } from "@/shared/infrastructure/db/client";
import {
  assertCashSessionAllowsVoid,
  createCashRepositories,
  getOpenCashSession,
  recordCashExpense,
  recordCashReversal,
  recordCashSale,
  type CashDeps,
  type CashRepositories,
} from "@/modules/cash";
import {
  createCatalogPersistence,
  createCatalogService,
  type CatalogInventoryCollaborator,
  type CatalogRepositories,
  type CatalogService,
} from "@/modules/catalog";
import {
  createInventoryRepositories,
  createInventoryService,
  type InventoryRepositories,
  type InventoryService,
} from "@/modules/inventory";
import {
  createLedgerPersistence,
  createLedgerService,
  createSessionLedgerReader,
  type LedgerCashCollaborator,
  type LedgerCatalogCollaborator,
  type LedgerRepositories,
  type LedgerService,
  type LedgerStockCollaborator,
} from "@/modules/ledger";
import { createReportingRepositories, type ReportingRepositories } from "@/modules/reporting";

export interface AppRepositories {
  cash: CashRepositories;
  catalog: CatalogRepositories;
  inventory: InventoryRepositories;
  ledger: LedgerRepositories;
  reporting: ReportingRepositories;
}

export interface AppRuntime {
  clock: Clock;
  ids: IdGenerator;
}

/**
 * Implements the catalog's inventory port with inventory's public transaction-scoped service. The initial stock goes
 * through the LEDGER (legacy parity: it books an "Ajuste Stock" row first; the stock audit row references it).
 */
export function catalogInventoryCollaborator(
  inventory: InventoryService,
  ledger: Pick<LedgerService, "recordStockAdjustment">,
): CatalogInventoryCollaborator {
  return {
    async recordInitialStock({ productId, quantity, actorId }) {
      const { movementId } = await ledger.recordStockAdjustment({
        productId,
        countedStock: quantity,
        actorId,
        reason: "Stock inicial",
      });
      return { movementId };
    },
    hasRecipe: (productId) => inventory.hasRecipe(productId),
    setRecipeComponent: (input) => inventory.setRecipeComponent(input),
  };
}

/** Ledger -> inventory: stock effects of ledger movements, on inventory's public transaction-scoped service. */
export function ledgerStockCollaborator(inventory: InventoryService): LedgerStockCollaborator {
  return {
    consumeSaleStock: async (input) => {
      await inventory.consumeSaleStock(input);
    },
    purchaseToStockQuantity: (productId, quantity) => inventory.purchaseToStockQuantity(productId, quantity),
    applyDirectStockDelta: ({ movementType, ...rest }) => inventory.applyDirectStockDelta({ ...rest, movementType }),
    planStockAdjustment: (input) => inventory.planStockAdjustment(input),
    createStockAdjustment: async (input) => {
      await inventory.createStockAdjustment(input);
    },
    reverseMovementStock: (input) => inventory.reverseMovementStock(input),
  };
}

/**
 * Ledger -> cash: the cash module's public hooks, bound to the SAME transaction (a "unit of work" that just hands out
 * the cash repositories of the surrounding one).
 */
export function ledgerCashCollaborator(cash: CashRepositories, runtime: AppRuntime): LedgerCashCollaborator {
  const deps: CashDeps = { uow: { run: (work) => work(cash) }, ...runtime };
  return {
    async findOpenSession(userId) {
      const session = await getOpenCashSession(deps)(userId);
      return session ? { id: session.id } : null;
    },
    assertSessionAllowsVoid: (sessionId) => assertCashSessionAllowsVoid(deps)(sessionId),
    async recordCashSale(input) {
      await recordCashSale(deps)({ ...input, actor: input.actorId });
    },
    async recordCashExpense(input) {
      await recordCashExpense(deps)({ ...input, actor: input.actorId });
    },
    async recordCashReversal(input) {
      await recordCashReversal(deps)({
        originalMovementId: input.originalMovementId,
        sessionId: input.sessionId,
        kind: input.kind,
        paymentMethod: input.paidInCash ? "cash" : "other",
        amount: input.amount,
        description: input.description,
        actor: input.actorId,
        reason: input.reason,
      });
    },
  };
}

/** Ledger -> catalog: read-only master data through the catalog's public service. */
export function ledgerCatalogCollaborator(catalog: CatalogService): LedgerCatalogCollaborator {
  return {
    async getProduct(id) {
      const product = await catalog.getProduct(id);
      return product
        ? { id: product.id, name: product.name, categoryName: product.categoryName, salePrice: product.salePrice, active: product.active }
        : null;
    },
    async resolveActivePaymentMethod(name) {
      const { id, name: displayName, code } = await catalog.resolveActivePaymentMethod(name);
      return { id, name: displayName, code };
    },
    async getPaymentMethod(id) {
      const method = (await catalog.listPaymentMethodRecords()).find((m) => m.id === id);
      return method ? { id: method.id, name: method.name, code: method.code } : null;
    },
    async getSupplier(id) {
      const supplier = await catalog.getSupplier(id);
      return supplier ? { id: supplier.id, name: supplier.name } : null;
    },
    async findMovementCategory(name, kind) {
      if (kind === "Ajuste Stock" || kind === "Venta") return null;
      const category = await catalog.findMovementCategory({ name, kind });
      return category ? { id: category.id, name: category.name } : null;
    },
  };
}

export function buildAppRepositories(db: DbExecutor, runtime: AppRuntime): AppRepositories {
  const inventory = createInventoryRepositories(db);
  const inventoryService = createInventoryService(inventory, runtime);
  // The cash module reads the ledger for expected amounts / sales summary (replaces its empty Phase 1 stub).
  const cash: CashRepositories = { ...createCashRepositories(db), ledger: createSessionLedgerReader(db) };

  // catalog <-> ledger is a cycle at wiring time only: the catalog books initial stock through the ledger service and
  // the ledger reads the catalog service. Both services are used lazily, after this function returns.
  const lazy: { ledgerService?: LedgerService } = {};
  const catalog: CatalogRepositories = {
    ...createCatalogPersistence(db),
    inventory: catalogInventoryCollaborator(inventoryService, { recordStockAdjustment: (i) => lazy.ledgerService!.recordStockAdjustment(i) }),
  };
  const ledger: LedgerRepositories = {
    ...createLedgerPersistence(db),
    stock: ledgerStockCollaborator(inventoryService),
    cash: ledgerCashCollaborator(cash, runtime),
    catalog: ledgerCatalogCollaborator(createCatalogService(catalog, runtime)),
  };
  lazy.ledgerService = createLedgerService(ledger, runtime);
  return { cash, inventory, catalog, ledger, reporting: createReportingRepositories(db) };
}
