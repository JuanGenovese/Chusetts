import { describe, expect, it } from "vitest";
import {
  groupTickets,
  legacyTimestampToIso,
  legacyUuid,
  LegacyDataError,
  mapPaymentMethod,
  mapRole,
  pesosToCents,
  productSku,
  resolveProductName,
  toDecimal,
  type LegacySaleLine,
} from "./mapping";

describe("pesosToCents", () => {
  it("converts exact pesos to integer cents", () => {
    expect(pesosToCents(4000, "x")).toBe(400000);
    expect(pesosToCents(1350.5, "x")).toBe(135050);
    expect(pesosToCents(0, "x")).toBe(0);
  });
  it("absorbs binary float noise but never rounds a real fraction of a cent", () => {
    expect(pesosToCents(0.1 + 0.2, "x")).toBe(30);
    expect(pesosToCents(19.99, "x")).toBe(1999);
    expect(() => pesosToCents(10.005, "x")).toThrow(LegacyDataError);
  });
  it("rejects null, NaN and negative values", () => {
    expect(() => pesosToCents(null, "x")).toThrow(LegacyDataError);
    expect(() => pesosToCents(Number.NaN, "x")).toThrow(LegacyDataError);
    expect(() => pesosToCents(-1, "x")).toThrow(LegacyDataError);
  });
});

describe("toDecimal", () => {
  it("keeps up to 9 decimals and tolerates float noise", () => {
    expect(toDecimal(566, "q")).toBe(566);
    expect(toDecimal(0.30000000000000004, "q")).toBe(0.3);
  });
  it("rejects non finite", () => {
    expect(() => toDecimal(Number.POSITIVE_INFINITY, "q")).toThrow(LegacyDataError);
  });
});

describe("mapRole", () => {
  it("maps legacy roles", () => {
    expect(mapRole("admin")).toBe("admin");
    expect(mapRole("cajero")).toBe("cashier");
    expect(mapRole(" Cajero ")).toBe("cashier");
  });
  it("fails on unknown roles instead of guessing", () => {
    expect(() => mapRole("superuser")).toThrow(LegacyDataError);
  });
});

describe("mapPaymentMethod", () => {
  it("maps legacy names to the seeded methods, Mercado Pago becoming Nave", () => {
    expect(mapPaymentMethod("Efectivo")).toEqual({ code: "EFECTIVO", name: "Efectivo" });
    expect(mapPaymentMethod("  mercado pago ")).toEqual({ code: "NAVE", name: "Nave" });
    expect(mapPaymentMethod("Nave")).toEqual({ code: "NAVE", name: "Nave" });
    expect(mapPaymentMethod("TARJETA")).toEqual({ code: "TARJETA", name: "Tarjeta" });
    expect(mapPaymentMethod("Transferencia")?.code).toBe("TRANSFERENCIA");
    expect(mapPaymentMethod("Otro")?.code).toBe("OTRO");
  });
  it("returns null for a missing value and throws for an unknown one", () => {
    expect(mapPaymentMethod(null)).toBeNull();
    expect(mapPaymentMethod("")).toBeNull();
    expect(() => mapPaymentMethod("Bitcoin")).toThrow(LegacyDataError);
  });
});

describe("legacyTimestampToIso", () => {
  it("reads naive legacy timestamps as Argentina local time (UTC-3)", () => {
    expect(legacyTimestampToIso("2026-06-26 11:27:32")).toBe("2026-06-26T11:27:32-03:00");
  });
  it("rejects malformed values", () => {
    expect(() => legacyTimestampToIso("26/06/2026")).toThrow(LegacyDataError);
  });
});

describe("legacyUuid", () => {
  it("is deterministic, version 5 and entity scoped", () => {
    const a = legacyUuid("movimientos", 1);
    expect(a).toBe(legacyUuid("movimientos", 1));
    expect(a).not.toBe(legacyUuid("productos", 1));
    expect(a).not.toBe(legacyUuid("movimientos", 2));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("productSku / resolveProductName", () => {
  it("builds the legacy P-0001 style sku", () => {
    expect(productSku(1)).toBe("P-0001");
    expect(productSku(1234)).toBe("P-1234");
  });
  it("keeps a real name, recovers a blank one from the last sale snapshot, else uses a placeholder", () => {
    expect(resolveProductName("  Pinta ", 1, null)).toBe("Pinta");
    expect(resolveProductName("", 14, "Sprite Grande")).toBe("Sprite Grande");
    expect(resolveProductName(null, 14, null)).toBe("(sin nombre) #14");
  });
});

const line = (over: Partial<LegacySaleLine>): LegacySaleLine => ({
  id: 1,
  ticketId: "T1",
  fecha: "2026-06-26",
  createdBy: "caja1",
  createdAt: "2026-06-26 11:00:00",
  medioPago: "Efectivo",
  observacion: null,
  importeCents: 1000,
  anulada: false,
  anuladaAt: null,
  anuladaPor: null,
  motivoAnulacion: null,
  ...over,
});

describe("groupTickets", () => {
  it("groups lines per ticket, summing only active lines", () => {
    const [t] = groupTickets([line({ id: 1 }), line({ id: 2, importeCents: 2500 }), line({ id: 3, importeCents: 700, anulada: true })]);
    expect(t.total).toBe(3500);
    expect(t.status).toBe("CONFIRMED");
    expect(t.lineIds).toEqual([1, 2, 3]);
    expect(t.voidedAt).toBeNull();
  });
  it("marks the ticket VOIDED with the void metadata when every line is voided", () => {
    const [t] = groupTickets([
      line({ id: 1, anulada: true, anuladaAt: "2026-06-26 11:05:00", anuladaPor: "admin", motivoAnulacion: "error" }),
      line({ id: 2, anulada: true, anuladaAt: "2026-06-26 11:05:00", anuladaPor: "admin", motivoAnulacion: "error" }),
    ]);
    expect(t.status).toBe("VOIDED");
    expect(t.total).toBe(0);
    expect(t.voidedBy).toBe("admin");
    expect(t.voidReason).toBe("error");
    expect(t.voidedAt).toBe("2026-06-26 11:05:00");
  });
  it("uses the earliest created_at, the payment method and notes of the ticket, and orders by first line id", () => {
    const groups = groupTickets([
      line({ id: 5, ticketId: "B", createdAt: "2026-06-26 12:00:00", observacion: "nota" }),
      line({ id: 2, ticketId: "A", createdAt: "2026-06-26 11:00:00", medioPago: "Mercado Pago" }),
      line({ id: 3, ticketId: "A", createdAt: "2026-06-26 10:59:59", medioPago: "Mercado Pago" }),
    ]);
    expect(groups.map((g) => g.ticketId)).toEqual(["A", "B"]);
    expect(groups[0].createdAt).toBe("2026-06-26 10:59:59");
    expect(groups[0].paymentMethodName).toBe("Nave");
    expect(groups[1].notes).toBe("nota");
  });
  it("flags tickets that mix payment methods", () => {
    const [t] = groupTickets([line({ id: 1 }), line({ id: 2, medioPago: "Tarjeta" })]);
    expect(t.mixedPayment).toBe(true);
  });
  it("falls back to Otro when the ticket has no payment method (legacy behaviour)", () => {
    const [t] = groupTickets([line({ medioPago: null })]);
    expect(t.paymentMethodName).toBe("Otro");
  });
});
