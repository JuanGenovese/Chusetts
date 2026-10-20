"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatMoney } from "@/shared/domain/money";
import { Alert, Button, Checkbox, Columns, DateInput, Divider, Field, NumberInput, PageHeader, Paragraph, RecordList, Subheader, TextArea } from "@/shared/ui";
import { movementsCsvFileName, movementsToCsv, type MovementFilters, type ReportMovement } from "../domain";
import { historyRecord } from "./mappers";
import type { MovementsActions, MovementsData, MovementToVoid } from "./types";

/** Legacy `record_list` default limit. */
const LIST_LIMIT = 60;

/** Legacy `st.download_button`: utf-8-sig CSV of the whole period. */
function downloadCsv(movements: ReportMovement[], filters: MovementFilters) {
  const blob = new Blob(["﻿", movementsToCsv(movements)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = movementsCsvFileName(filters.from, filters.to);
  link.click();
  URL.revokeObjectURL(url);
}

/** Filters (kept in the URL: the server reads the period) + the movements list + CSV. Remounted when the URL changes. */
function HistorySection({ data }: { data: MovementsData }) {
  const router = useRouter();
  const [filters, setFilters] = useState(data.filters);
  const [, startTransition] = useTransition();

  const apply = (next: MovementFilters) => {
    setFilters(next);
    const params = new URLSearchParams({ desde: next.from, hasta: next.to });
    if (next.includeVoided) params.set("anulados", "1");
    startTransition(() => router.replace(`/movimientos?${params}`));
  };

  return (
    <>
      <Columns>
        <Field label="Desde">
          <DateInput value={filters.from} onChange={(from) => apply({ ...filters, from })} />
        </Field>
        <Field label="Hasta">
          <DateInput value={filters.to} onChange={(to) => apply({ ...filters, to })} />
        </Field>
        <Checkbox label="Incluir anulados" checked={filters.includeVoided} onChange={(e) => apply({ ...filters, includeVoided: e.target.checked })} />
      </Columns>
      {data.movements.length > 0 ? (
        <>
          <RecordList records={data.movements.slice(0, LIST_LIMIT).map(historyRecord)} />
          <div>
            <Button variant="secondary" onClick={() => downloadCsv(data.movements, data.filters)}>
              Descargar detalle en CSV
            </Button>
          </div>
        </>
      ) : (
        <Alert tone="info">No hay movimientos para el período seleccionado.</Alert>
      )}
    </>
  );
}

/** "Anular movimiento individual": look a movement up by its number, then void it with a mandatory reason. */
function VoidSection({ actions }: { actions: MovementsActions }) {
  const [numberText, setNumberText] = useState("1");
  const [movement, setMovement] = useState<MovementToVoid | null>(null);
  const [reason, setReason] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const load = () => {
    const number = Number(numberText);
    setResult(null);
    startTransition(async () => {
      const found = await actions.find({ number });
      if (found.ok && found.movement) {
        setLookupError(null);
        setReason("");
        setMovement(found.movement);
      } else {
        setMovement(null);
        setLookupError(found.message ?? "No se encontró el movimiento.");
      }
    });
  };

  const confirm = () => {
    if (!movement || pending) return;
    startTransition(async () => {
      const done = await actions.void({ number: movement.number, reason });
      setResult({ ok: done.ok, text: done.message ?? "" });
      if (done.ok) {
        setMovement(null);
        setReason("");
      }
    });
  };

  return (
    <>
      <Subheader>Anular movimiento individual</Subheader>
      <Field label="ID del movimiento a anular">
        <NumberInput value={numberText} onChange={(e) => setNumberText(e.target.value)} />
      </Field>
      <div>
        <Button variant="secondary" disabled={pending} onClick={load}>
          Cargar movimiento
        </Button>
      </div>
      {lookupError ? <Alert tone="error">{lookupError}</Alert> : null}
      {result?.ok ? <Alert tone="success">{result.text}</Alert> : null}
      {movement ? (
        <>
          <Divider />
          <Paragraph>
            <strong>Movimiento seleccionado:</strong> #{movement.number} | {movement.businessDate} | {movement.kind} | <em>{movement.description}</em> |{" "}
            <strong>{formatMoney(movement.amount)}</strong>
          </Paragraph>
          {movement.voided ? (
            <Alert tone="warning">Este movimiento ya fue anulado. Motivo: {movement.voidReason}</Alert>
          ) : (
            <>
              <Field label="Motivo de la anulación administrativo">
                <TextArea value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} />
              </Field>
              <Button block disabled={pending} onClick={confirm}>
                Confirmar anulación administrativa
              </Button>
              {result && !result.ok ? <Alert tone="error">{result.text}</Alert> : null}
            </>
          )}
        </>
      ) : null}
    </>
  );
}

/**
 * "Historial de movimientos" (legacy ui/admin/movements.py `movimientos_page`). Data and Server Actions come from the
 * route; the screen only owns the filter inputs and the void form state.
 */
export function MovementsScreen({ data, actions }: { data: MovementsData; actions: MovementsActions }) {
  const { from, to, includeVoided } = data.filters;
  return (
    <>
      <PageHeader title="Historial de movimientos" subtitle="Consulta detallada de todas las transacciones de caja y mercadería." />
      <HistorySection key={`${from}|${to}|${includeVoided}`} data={data} />
      <VoidSection actions={actions} />
    </>
  );
}
