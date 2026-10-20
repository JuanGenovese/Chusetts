import { beforeEach, describe, expect, it } from "vitest";
import { LedgerError, LedgerPermissionError, type Actor } from "../domain";
import { makeLedgerTestDeps } from "./testing/in-memory";
import { ledgerUseCases } from "./index";

const pesos = (n: number) => n * 100;
const ADMIN: Actor = { id: "admin-1", role: "admin" };
const CASHIER: Actor = { id: "cashier-1", role: "cashier" };
const OTHER_CASHIER: Actor = { id: "cashier-2", role: "cashier" };

let t: ReturnType<typeof makeLedgerTestDeps>;
let ledger: ReturnType<typeof ledgerUseCases>;
let sessionId: string;
let beer: string;

beforeEach(() => {
  t = makeLedgerTestDeps();
  ledger = ledgerUseCases(t.deps);
  sessionId = t.world.openSession(CASHIER.id);
  beer = t.world.addProduct({ name: "Cerveza", salePrice: pesos(5000), stock: 10 });
});

async function sellBeer(quantity = 1, payment = "Efectivo", actor = CASHIER) {
  return ledger.registerSaleTicket({ actor, lines: [{ productId: beer, quantity }], paymentMethod: payment });
}

describe("registerSaleTicket", () => {
  it("writes ticket + ledger line + stock consumption + cash sale in one go", async () => {
    const result = await sellBeer(2);
    const w = t.world;
    expect(result.ticketId).toMatch(/^20260830-[0-9A-F]{6}$/);
    expect(result.total).toBe(pesos(10_000));
    expect(w.movements).toHaveLength(1);
    expect(w.movements[0]).toMatchObject({
      kind: "Venta",
      category: "Venta mostrador",
      description: "Cerveza",
      productId: beer,
      productName: "Cerveza",
      quantity: 2,
      unitPrice: pesos(5000),
      amount: pesos(10_000),
      paymentMethodId: "pm-cash",
      paymentMethodName: "Efectivo",
      supplierName: "",
      createdBy: CASHIER.id,
      voided: false,
      ticketId: result.ticketId,
      cashSessionId: sessionId,
      businessDate: "2026-08-30",
    });
    expect(w.orders).toEqual([
      expect.objectContaining({
        ticketId: result.ticketId,
        status: "CONFIRMED",
        total: pesos(10_000),
        businessDate: "2026-08-30",
        cashSessionId: sessionId,
        paymentMethodId: "pm-cash",
        createdBy: CASHIER.id,
      }),
    ]);
    expect(w.movements[0].saleOrderId).toBe(w.orders[0].id);
    expect(w.lines).toEqual([
      expect.objectContaining({ orderId: w.orders[0].id, sequence: 10, productName: "Cerveza", quantity: 2, unitPrice: pesos(5000), subtotal: pesos(10_000), movementId: w.movements[0].id }),
    ]);
    expect(w.stock(beer)).toBe(8);
    expect(w.cashRows.filter((r) => r.kind === "CASH_SALE" && r.ref.startsWith("MOVEMENT:"))).toEqual([
      expect.objectContaining({ amount: pesos(10_000), description: "Cerveza", ref: `MOVEMENT:${w.movements[0].id}` }),
    ]);
  });

  it("a non-cash sale does not touch the cash drawer", async () => {
    await sellBeer(1, "Transferencia");
    expect(t.world.movements[0].paymentMethodName).toBe("Transferencia");
    expect(t.world.cashRows).toHaveLength(1); // only the opening
    expect(t.world.stock(beer)).toBe(9);
  });

  it("a multi-line ticket numbers lines 10, 20, ... and records one cash sale per line", async () => {
    const water = t.world.addProduct({ name: "Agua", salePrice: pesos(1500), stock: 5 });
    const result = await ledger.registerSaleTicket({
      actor: CASHIER,
      lines: [{ productId: beer, quantity: 1 }, { productId: water, quantity: 3 }],
      paymentMethod: "efectivo",
      notes: "mesa 4",
    });
    expect(result.total).toBe(pesos(5000) + pesos(4500));
    expect(t.world.lines.map((l) => [l.sequence, l.productName, l.subtotal])).toEqual([[10, "Cerveza", pesos(5000)], [20, "Agua", pesos(4500)]]);
    expect(t.world.orders[0]).toMatchObject({ total: pesos(9500), notes: "mesa 4" });
    expect(t.world.movements.every((m) => m.notes === "mesa 4")).toBe(true);
    expect(t.world.cashRows.filter((r) => r.ref.startsWith("MOVEMENT:")).map((r) => r.description)).toEqual(["Cerveza", "Agua"]);
  });

  it("uses the catalog price, not a client price", async () => {
    await sellBeer(1);
    expect(t.world.movements[0].unitPrice).toBe(pesos(5000));
  });

  it("rejects an empty cart first", async () => {
    await expect(ledger.registerSaleTicket({ actor: CASHIER, lines: [], paymentMethod: "Efectivo" })).rejects.toThrow("El carrito está vacío.");
  });

  it("requires the cashier's open session and writes nothing without it", async () => {
    await expect(sellBeer(1, "Efectivo", OTHER_CASHIER)).rejects.toThrow("Tu turno ya no está abierto. Abrí un turno antes de confirmar la venta.");
    expect(t.world.movements).toHaveLength(0);
    expect(t.world.orders).toHaveLength(0);
  });

  it("rejects an unknown or inactive payment method", async () => {
    await expect(sellBeer(1, "Bitcoin")).rejects.toThrow("El medio de pago no existe o está inactivo.");
  });

  it("rejects a missing product and a non-positive quantity", async () => {
    await expect(ledger.registerSaleTicket({ actor: CASHIER, lines: [{ productId: "nope", quantity: 1 }], paymentMethod: "Efectivo" })).rejects.toThrow(
      "El producto no existe o está inactivo.",
    );
    await expect(sellBeer(0)).rejects.toThrow("La cantidad vendida debe ser mayor que cero.");
  });

  it("rolls EVERYTHING back when a later line has insufficient stock", async () => {
    const scarce = t.world.addProduct({ name: "Escaso", salePrice: pesos(100), stock: 1 });
    const before = t.world.snapshot();
    await expect(
      ledger.registerSaleTicket({
        actor: CASHIER,
        lines: [{ productId: beer, quantity: 2 }, { productId: scarce, quantity: 2 }],
        paymentMethod: "Efectivo",
      }),
    ).rejects.toThrow("Stock insuficiente.");
    expect(t.world.snapshot()).toEqual(before);
    expect(t.world.stock(beer)).toBe(10);
  });
});

describe("voidTicket", () => {
  it("reverses ledger, stock, cash and the order of the cashier's own ticket", async () => {
    const { ticketId } = await sellBeer(2);
    await ledger.voidTicket({ actor: CASHIER, ticketId, reason: "  error de carga " });
    const w = t.world;
    expect(w.movements[0]).toMatchObject({ voided: true, voidReason: "error de carga", voidedBy: CASHIER.id });
    expect(w.stock(beer)).toBe(10);
    expect(w.cashRows.at(-1)).toMatchObject({ kind: "SALE_REFUND", sign: -1, amount: pesos(10_000), description: "Anulación: Cerveza", reason: "error de carga" });
    expect(w.cashBalance(sessionId)).toBe(1_000_000);
    expect(w.orders[0]).toMatchObject({ status: "VOIDED", total: 0, voidedBy: CASHIER.id, voidReason: "error de carga" });
  });

  it("a non-cash ticket reverses stock but writes no cash reversal", async () => {
    const { ticketId } = await sellBeer(1, "Transferencia");
    await ledger.voidTicket({ actor: CASHIER, ticketId, reason: "x" });
    expect(t.world.cashRows).toHaveLength(1);
    expect(t.world.stock(beer)).toBe(10);
  });

  it("is rejected with ZERO writes when the ticket's cash session is closed", async () => {
    const { ticketId } = await sellBeer(1);
    t.world.closeSession(CASHIER.id);
    const before = t.world.snapshot();
    await expect(ledger.voidTicket({ actor: CASHIER, ticketId, reason: "x" })).rejects.toThrow(
      "No se puede anular: la caja de este ticket ya está cerrada. Registre un ajuste manual en la caja abierta.",
    );
    expect(t.world.snapshot()).toEqual(before);
  });

  it("a cashier cannot void somebody else's ticket (an admin can)", async () => {
    const { ticketId } = await sellBeer(1);
    await expect(ledger.voidTicket({ actor: OTHER_CASHIER, ticketId, reason: "x" })).rejects.toThrow("No se encontró el ticket o ya estaba anulado.");
    await expect(ledger.voidTicket({ actor: ADMIN, ticketId, reason: "x" })).resolves.toBeUndefined();
    expect(t.world.movements[0].voidedBy).toBe(ADMIN.id);
  });

  it("cannot be voided twice and unknown tickets are not found", async () => {
    const { ticketId } = await sellBeer(1);
    await ledger.voidTicket({ actor: CASHIER, ticketId, reason: "x" });
    await expect(ledger.voidTicket({ actor: CASHIER, ticketId, reason: "x" })).rejects.toThrow("No se encontró el ticket o ya estaba anulado.");
    await expect(ledger.voidTicket({ actor: CASHIER, ticketId: "nope", reason: "x" })).rejects.toThrow("No se encontró el ticket o ya estaba anulado.");
  });

  it("requires a reason before anything else", async () => {
    await expect(ledger.voidTicket({ actor: CASHIER, ticketId: "nope", reason: "  " })).rejects.toThrow(new LedgerError("El motivo es obligatorio."));
  });
});

describe("voidMovement (admin)", () => {
  it("voiding one line of a ticket re-syncs the order total and keeps it confirmed", async () => {
    const water = t.world.addProduct({ name: "Agua", salePrice: pesos(1500), stock: 5 });
    const { ticketId } = await ledger.registerSaleTicket({
      actor: CASHIER,
      lines: [{ productId: beer, quantity: 1 }, { productId: water, quantity: 1 }],
      paymentMethod: "Efectivo",
    });
    await ledger.voidMovement({ actor: ADMIN, movementId: t.world.movements[1].id, reason: "se devolvió" });
    expect(t.world.orders[0]).toMatchObject({ status: "CONFIRMED", total: pesos(5000) });
    expect(t.world.stock(water)).toBe(5);
    expect(t.world.cashRows.at(-1)).toMatchObject({ kind: "SALE_REFUND", amount: pesos(1500) });
    await ledger.voidMovement({ actor: ADMIN, movementId: t.world.movements[0].id, reason: "se devolvió" });
    expect(t.world.orders[0]).toMatchObject({ status: "VOIDED", total: 0 });
    expect(ticketId).toBe(t.world.orders[0].ticketId);
  });

  it("is admin-only, validates the reason, existence and state", async () => {
    await sellBeer(1);
    const id = t.world.movements[0].id;
    await expect(ledger.voidMovement({ actor: CASHIER, movementId: id, reason: "x" })).rejects.toThrow(LedgerPermissionError);
    await expect(ledger.voidMovement({ actor: ADMIN, movementId: id, reason: " " })).rejects.toThrow("El motivo de anulación es obligatorio.");
    await expect(ledger.voidMovement({ actor: ADMIN, movementId: "nope", reason: "x" })).rejects.toThrow("No se encontró el movimiento.");
    await ledger.voidMovement({ actor: ADMIN, movementId: id, reason: "x" });
    await expect(ledger.voidMovement({ actor: ADMIN, movementId: id, reason: "x" })).rejects.toThrow("El movimiento ya estaba anulado.");
  });

  it("is rejected with zero writes when the movement's session is closed", async () => {
    await sellBeer(1);
    t.world.closeSession(CASHIER.id);
    const before = t.world.snapshot();
    await expect(ledger.voidMovement({ actor: ADMIN, movementId: t.world.movements[0].id, reason: "x" })).rejects.toThrow("la caja de este ticket ya está cerrada");
    expect(t.world.snapshot()).toEqual(before);
  });

  it("voiding a cash expense gives the cash back; voiding a purchase also reverses its stock", async () => {
    t.world.openSession(ADMIN.id, "cs-admin", pesos(100_000));
    await ledger.registerExpense({ actor: ADMIN, businessDate: "2026-08-30", description: "Luz", category: "Servicios", amount: pesos(20_000), paymentMethod: "Efectivo" });
    await ledger.registerPurchase({
      actor: ADMIN, businessDate: "2026-08-30", description: "Cerveza x6", category: "Compra bebida", productId: beer, quantity: 6, unitCost: pesos(2000), paymentMethod: "Efectivo",
    });
    expect(t.world.cashBalance("cs-admin")).toBe(pesos(100_000 - 20_000 - 12_000));
    expect(t.world.stock(beer)).toBe(16);
    await ledger.voidMovement({ actor: ADMIN, movementId: t.world.movements[0].id, reason: "x" });
    await ledger.voidMovement({ actor: ADMIN, movementId: t.world.movements[1].id, reason: "x" });
    expect(t.world.cashBalance("cs-admin")).toBe(pesos(100_000));
    expect(t.world.stock(beer)).toBe(10);
    expect(t.world.cashRows.slice(-2).map((r) => r.kind)).toEqual(["OUTFLOW_REVERSAL", "OUTFLOW_REVERSAL"]);
  });
});

describe("registerExpense (Cargar gasto)", () => {
  beforeEach(() => {
    t.world.openSession(ADMIN.id, "cs-admin", pesos(50_000));
  });
  const expense = (over: Partial<Parameters<typeof ledger.registerExpense>[0]> = {}) =>
    ledger.registerExpense({ actor: ADMIN, businessDate: "2026-08-29", description: " Sueldo ", category: "Servicios", amount: pesos(8000), paymentMethod: "Efectivo", ...over });

  it("writes the expense row (qty 1, price = amount) and the cash outflow when paid in cash", async () => {
    const { movementId } = await expense();
    expect(t.world.movements[0]).toMatchObject({
      id: movementId, kind: "Gasto", category: "Servicios", categoryId: "mc-gasto", description: "Sueldo", productId: null, productName: null,
      quantity: 1, unitPrice: pesos(8000), amount: pesos(8000), paymentMethodName: "Efectivo", supplierName: "", businessDate: "2026-08-29",
      ticketId: null, cashSessionId: "cs-admin", saleOrderId: null,
    });
    expect(t.world.cashRows.at(-1)).toMatchObject({ kind: "CASH_OUTFLOW", amount: pesos(8000), description: "Sueldo" });
    expect(t.world.orders).toHaveLength(0);
  });

  it("keeps a free-text category that is not in the table (legacy 'Sin categoría')", async () => {
    await expense({ category: "Sin categoría" });
    expect(t.world.movements[0]).toMatchObject({ category: "Sin categoría", categoryId: null });
  });

  it("a non-cash expense needs no open session and does not touch the drawer", async () => {
    t.world.closeSession(ADMIN.id);
    await expense({ paymentMethod: "Transferencia" });
    expect(t.world.movements[0]).toMatchObject({ cashSessionId: null, paymentMethodName: "Transferencia" });
  });

  it("paying in cash without an open session is rejected", async () => {
    t.world.closeSession(ADMIN.id);
    await expect(expense()).rejects.toThrow("Para pagar en efectivo primero tenés que abrir tu turno desde Mi turno.");
    expect(t.world.movements).toHaveLength(0);
  });

  it("validates description first, then permissions are admin-only", async () => {
    await expect(expense({ description: "   " })).rejects.toThrow("La descripción es obligatoria.");
    await expect(expense({ actor: CASHIER })).rejects.toThrow(LedgerPermissionError);
  });

  it("rolls back the ledger row when the drawer cannot cover the cash expense", async () => {
    await expect(expense({ amount: pesos(60_000) })).rejects.toThrow("El movimiento dejaría la caja con efectivo negativo.");
    expect(t.world.movements).toHaveLength(0);
  });

  it("rejects an invalid date and a negative amount", async () => {
    await expect(expense({ businessDate: "29/08/2026" })).rejects.toThrow("La fecha es inválida.");
    await expect(expense({ amount: -1 })).rejects.toThrow("El importe no puede ser negativo.");
  });
});

describe("registerPurchase (Cargar compra)", () => {
  beforeEach(() => {
    t.world.openSession(ADMIN.id, "cs-admin", pesos(50_000));
    t.world.suppliers.set("sup-1", { id: "sup-1", name: "Distribuidora Norte" });
  });

  it("converts the purchase quantity to stock, books the intake and pays from the drawer", async () => {
    const crate = t.world.addProduct({ name: "Fernet 750", stock: 100, purchaseFactor: 12 });
    await ledger.registerPurchase({
      actor: ADMIN, businessDate: "2026-08-30", description: "Fernet", category: "Compra bebida", productId: crate, supplierId: "sup-1",
      quantity: 2, unitCost: pesos(3000), paymentMethod: "Efectivo",
    });
    expect(t.world.stock(crate)).toBe(124);
    expect(t.world.stockRows[0]).toMatchObject({ type: "INGRESO_COMPRA", delta: 24, reason: "Ingreso por compra" });
    expect(t.world.movements[0]).toMatchObject({
      kind: "Compra", productId: crate, productName: "Fernet 750", quantity: 2, unitPrice: pesos(3000), amount: pesos(6000),
      supplierId: "sup-1", supplierName: "Distribuidora Norte", category: "Compra bebida", categoryId: "mc-compra",
    });
    expect(t.world.cashRows.at(-1)).toMatchObject({ kind: "CASH_OUTFLOW", amount: pesos(6000), description: "Fernet" });
  });

  it("a purchase without product only books the ledger row (and the cash outflow)", async () => {
    await ledger.registerPurchase({
      actor: ADMIN, businessDate: "2026-08-30", description: "Hielo", category: "Compra insumos", productId: null, quantity: 1, unitCost: pesos(500), paymentMethod: "Efectivo",
    });
    expect(t.world.stockRows).toHaveLength(0);
    expect(t.world.movements[0]).toMatchObject({ productId: null, productName: null, amount: pesos(500) });
  });

  it("rolls the stock intake back when the cash payment fails", async () => {
    const before = t.world.snapshot();
    await expect(
      ledger.registerPurchase({
        actor: ADMIN, businessDate: "2026-08-30", description: "Caro", category: "Compra bebida", productId: beer, quantity: 100, unitCost: pesos(5000), paymentMethod: "Efectivo",
      }),
    ).rejects.toThrow("El movimiento dejaría la caja con efectivo negativo.");
    expect(t.world.snapshot()).toEqual(before);
  });

  it("rejects an unknown supplier", async () => {
    await expect(
      ledger.registerPurchase({
        actor: ADMIN, businessDate: "2026-08-30", description: "x", category: "Compra bebida", productId: null, supplierId: "ghost", quantity: 1, unitCost: 100, paymentMethod: "Transferencia",
      }),
    ).rejects.toThrow("El proveedor no existe.");
  });
});

describe("registerAdminSale (administrative sale)", () => {
  const sale = (over: Partial<Parameters<typeof ledger.registerAdminSale>[0]> = {}) =>
    ledger.registerAdminSale({ actor: ADMIN, businessDate: "2026-08-25", description: "Venta evento", productId: beer, quantity: 3, unitPrice: pesos(4000), paymentMethod: "Efectivo", ...over });

  it("requires the admin's own open session", async () => {
    await expect(sale()).rejects.toThrow("Para registrar una venta administrativa primero tenés que abrir tu turno desde Mi turno.");
  });

  it("creates the order on the chosen date, the ticket on today's date and consumes stock + cash", async () => {
    t.world.openSession(ADMIN.id, "cs-admin");
    const { ticketId } = await sale();
    expect(ticketId).toMatch(/^20260830-/);
    expect(t.world.orders[0]).toMatchObject({ ticketId, businessDate: "2026-08-25", total: pesos(12_000), createdBy: ADMIN.id });
    expect(t.world.movements[0]).toMatchObject({ businessDate: "2026-08-25", category: "Bebidas", unitPrice: pesos(4000), amount: pesos(12_000) });
    expect(t.world.lines[0]).toMatchObject({ sequence: 10, productName: "Cerveza" });
    expect(t.world.stock(beer)).toBe(7);
    expect(t.world.cashRows.at(-1)).toMatchObject({ kind: "CASH_SALE", amount: pesos(12_000), description: "Venta evento" });
  });

  it("a sale without product has category 'Venta', no stock effect, and the description names the line", async () => {
    t.world.openSession(ADMIN.id, "cs-admin");
    await sale({ productId: null, description: " Propina ", quantity: 1, unitPrice: pesos(700), paymentMethod: "Transferencia" });
    expect(t.world.movements[0]).toMatchObject({ category: "Venta", productId: null, productName: null, description: "Propina" });
    expect(t.world.lines[0]).toMatchObject({ productId: null, productName: "Propina" });
    expect(t.world.stockRows).toHaveLength(0);
    expect(t.world.cashRows).toHaveLength(2); // only the two openings
  });
});

describe("stock adjustments", () => {
  it("adjustStock books the 'Ajuste Stock' row (signed delta) BEFORE the stock audit row", async () => {
    const result = await ledger.adjustStock({ actor: ADMIN, productId: beer, countedStock: 7, reason: " Conteo semanal " });
    expect(t.world.movements[0]).toMatchObject({
      id: result.movementId, kind: "Ajuste Stock", category: "Bebidas", description: "Ajuste físico: Cerveza", productId: beer, productName: "Cerveza",
      quantity: -3, unitPrice: 0, amount: 0, paymentMethodId: null, paymentMethodName: null, supplierName: "", notes: "Conteo semanal",
      createdBy: ADMIN.id, ticketId: null, cashSessionId: null, businessDate: "2026-08-30",
    });
    expect(t.world.stockRows[0]).toMatchObject({ movementId: result.movementId, type: "AJUSTE_FISICO", delta: -3, reason: "Conteo semanal" });
    expect(t.world.stock(beer)).toBe(7);
    expect(result).toMatchObject({ productName: "Cerveza", previousStock: 10, newStock: 7, delta: -3 });
  });

  it("is admin-only and writes no ledger row when the inventory validation fails", async () => {
    await expect(ledger.adjustStock({ actor: CASHIER, productId: beer, countedStock: 7, reason: "x" })).rejects.toThrow(LedgerPermissionError);
    await expect(ledger.adjustStock({ actor: ADMIN, productId: beer, countedStock: 10, reason: "x" })).rejects.toThrow("El stock contado coincide con el stock del sistema.");
    await expect(ledger.adjustStock({ actor: ADMIN, productId: beer, countedStock: 5, reason: " " })).rejects.toThrow("El motivo del ajuste es obligatorio.");
    expect(t.world.movements).toHaveLength(0);
  });

  it("recordStockAdjustment (system use: initial stock) skips the permission check", async () => {
    const fresh = t.world.addProduct({ name: "Nuevo", stock: 0 });
    const { movementId } = await ledger.recordStockAdjustment({ actorId: ADMIN.id, productId: fresh, countedStock: 12, reason: "Stock inicial" });
    expect(t.world.movements[0]).toMatchObject({ id: movementId, quantity: 12, notes: "Stock inicial", description: "Ajuste físico: Nuevo" });
    expect(t.world.stock(fresh)).toBe(12);
  });

  it("a generic admin 'Ajuste Stock' movement applies its quantity as an AJUSTE_ADMIN delta", async () => {
    t.world.openSession(ADMIN.id, "cs-admin");
    await ledger.createAdminMovement({
      actor: ADMIN, kind: "Ajuste Stock", businessDate: "2026-08-30", category: "Bebidas", description: "Rotura", productId: beer, quantity: -2, unitPrice: 0, amount: 0, paymentMethod: "Transferencia",
    });
    expect(t.world.stockRows[0]).toMatchObject({ type: "AJUSTE_ADMIN", delta: -2, reason: "Ajuste administrativo" });
    expect(t.world.stock(beer)).toBe(8);
    await ledger.voidMovement({ actor: ADMIN, movementId: t.world.movements[0].id, reason: "x" });
    expect(t.world.stock(beer)).toBe(10);
    expect(t.world.cashRows).toHaveLength(2); // only the two openings
  });
});
