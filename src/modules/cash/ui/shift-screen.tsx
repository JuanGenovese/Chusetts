"use client";

import { useState } from "react";
import { formatTimestamp } from "@/shared/domain/datetime";
import { formatMoney } from "@/shared/domain/money";
import { Alert, Caption, Columns, Divider, Metric, PageHeader, Paragraph, RecordList, Subheader, type RecordItem } from "@/shared/ui";
import type { CashSession } from "../domain";
import type { CashSessionOverview } from "../application";
import { CloseShiftForm, OpenShiftForm } from "./shift-forms";
import type { ShiftActions, ShiftPageData } from "./types";

function OpenShiftSummary({ overview }: { overview: CashSessionOverview }) {
  const { session, salesSummary, expected } = overview;
  return (
    <>
      <Alert tone="success">
        Caja #{session.number} abierta desde {formatTimestamp(session.openedAt)}
      </Alert>
      <Columns>
        <Metric label="Efectivo inicial" value={formatMoney(session.openingCash)} />
        <Metric label="Ventas del turno" value={formatMoney(salesSummary.sales)} />
        <Metric label="Ventas en efectivo" value={formatMoney(salesSummary.cashSales)} />
        <Metric label="Efectivo esperado" value={formatMoney(expected.cash)} />
      </Columns>
      <Caption>
        Ventas electrónicas informadas: {formatMoney(salesSummary.electronicSales)}. No se cuentan físicamente al cerrar.
      </Caption>
    </>
  );
}

function toRecord(session: CashSession): RecordItem {
  return {
    key: session.id,
    title: `Caja #${session.number}`,
    subtitle: `${session.businessDate} · ${session.status === "OPEN" ? "ABIERTO" : "CERRADO"}`,
    fields: [
      { label: "Esperado", value: formatMoney(session.expectedAmounts?.cash ?? 0) },
      { label: "Contado", value: formatMoney(session.countedAmounts?.cash ?? 0) },
      { label: "Diferencia", value: formatMoney(session.difference ?? 0) },
    ],
  };
}

/**
 * "Mi turno" (legacy ui/cashier/shift.py `_own_cash_page`). Container: owns the one-shot flash message;
 * data and Server Actions are injected by the route.
 */
export function ShiftScreen({ data, actions }: { data: ShiftPageData; actions: ShiftActions }) {
  const [flash, setFlash] = useState<string | null>(null);
  const { overview, recentSessions } = data;
  const formProps = { onSubmitted: () => setFlash(null), onSucceeded: setFlash };

  return (
    <>
      <PageHeader title="Mi caja" subtitle="La caja sigue abierta después de medianoche hasta que la cierres." />
      {flash ? <Alert tone="success">{flash}</Alert> : null}
      {overview ? (
        <>
          <OpenShiftSummary overview={overview} />
          <CloseShiftForm
            key={overview.session.id}
            action={actions.close}
            expectedCash={overview.expected.cash}
            {...formProps}
          />
        </>
      ) : (
        <>
          <Alert tone="warning">Caja cerrada</Alert>
          <Paragraph>Antes de vender, indicá cuánto efectivo hay físicamente en la caja.</Paragraph>
          <OpenShiftForm action={actions.open} {...formProps} />
        </>
      )}
      <Divider />
      <Subheader>Mis últimos cierres</Subheader>
      {recentSessions.length > 0 ? (
        <RecordList records={recentSessions.map(toRecord)} />
      ) : (
        <Alert tone="info">Todavía no hay cierres registrados.</Alert>
      )}
    </>
  );
}
