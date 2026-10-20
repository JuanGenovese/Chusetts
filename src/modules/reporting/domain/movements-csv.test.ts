import { describe, expect, it } from "vitest";
import { movementsCsvFileName, movementsToCsv } from "./movements-csv";
import type { ReportMovement } from "./types";

const base: ReportMovement = {
  id: "a", number: 7, businessDate: "2026-08-30", kind: "Venta", category: null, description: "Cerveza", productName: "Pinta IPA",
  quantity: 2, unitPrice: 500_000, amount: 1_000_000, paymentMethod: "Efectivo", supplier: "", notes: "", createdByUsername: "cajero",
  createdAt: new Date("2026-08-30T15:00:00Z"), voided: false, voidReason: null, ticketId: "T-1",
};

describe("movementsToCsv", () => {
  it("writes the legacy header and one line per movement with pesos amounts", () => {
    const [header, line] = movementsToCsv([base]).split("\n");
    expect(header).toBe(
      "id,ticket_id,fecha,tipo,categoria,descripcion,producto_nombre,cantidad,importe,medio_pago,proveedor,created_by,created_at,anulada,motivo_anulacion",
    );
    expect(line).toBe("7,T-1,2026-08-30,Venta,,Cerveza,Pinta IPA,2,10000,Efectivo,,cajero,2026-08-30 12:00:00,0,");
  });

  it("quotes cells with commas, quotes or line breaks and flags voided rows", () => {
    const csv = movementsToCsv([{ ...base, description: 'Vaso "grande", rojo', voided: true, voidReason: "a\nb" }]);
    expect(csv).toContain('"Vaso ""grande"", rojo"');
    expect(csv).toContain(',1,"a\nb"');
  });

  it("an empty period still has the header", () => {
    expect(movementsToCsv([]).split("\n")).toHaveLength(1);
  });

  it("names the file after the period", () => {
    expect(movementsCsvFileName("2026-08-01", "2026-08-30")).toBe("movimientos_2026-08-01_2026-08-30.csv");
  });
});
