"use client";

import { useActionState, useState, useTransition, type FormEvent } from "react";
import { formatMoney, formatPesosInput } from "@/shared/domain/money";
import { Alert, Button, Columns, Field, Form, Metric, NumberInput, PageHeader, Paragraph, RecordList, Select, Subheader, Tabs, TextArea, type ActionState } from "@/shared/ui";
import type { CashAdminOverview } from "../domain";
import { auditEventRecord, ledgerRecord, openSessionRecord, sessionHistoryRecord } from "./mappers";
import type { CashAdminActions, CashAdminData, FormAction } from "./types";

/** Legacy `MANUAL_TYPES` (label -> code), in the legacy order. */
const MANUAL_TYPES = [
  { value: "MANUAL_INCOME", label: "Ingreso de efectivo" },
  { value: "WITHDRAWAL", label: "Retiro de efectivo" },
  { value: "CASH_EXPENSE", label: "Gasto pagado desde caja" },
  { value: "POSITIVE_ADJUSTMENT", label: "Ajuste positivo autorizado" },
  { value: "NEGATIVE_ADJUSTMENT", label: "Ajuste negativo autorizado" },
] as const;

// Legacy record_list limits: sessions / ledger default to 60, the audit list shows 40 sessions and 80 events.
const SESSIONS_LIMIT = 60;
const LEDGER_LIMIT = 60;
const AUDIT_SESSIONS_LIMIT = 40;
const EVENTS_LIMIT = 80;

const initial: ActionState = { ok: false };

interface ManualMovementFormProps {
  overview: CashAdminOverview;
  action: FormAction;
  /** A submission starts (clears the previous flash) / succeeds (flash text). */
  onSubmitted: () => void;
  onSucceeded: (message: string) => void;
}

/** Keeps what the user typed when the server rejects the movement and shows the error under the form. */
function ManualMovementForm({ overview, action, onSubmitted, onSucceeded }: ManualMovementFormProps) {
  const [state, dispatch] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.ok) onSucceeded(result.message ?? "");
    return result;
  }, initial);
  const [pending, startTransition] = useTransition();

  if (overview.openSessions.length === 0) return <Alert tone="info">Necesitás una caja abierta para registrar un movimiento.</Alert>;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    onSubmitted();
    startTransition(() => dispatch(data));
  };

  return (
    <>
      <Paragraph>Solo un administrador puede registrar estos movimientos y el motivo queda auditado.</Paragraph>
      <Form onSubmit={onSubmit} aria-busy={pending}>
        <Field label="Caja">
          <Select name="sessionId">
            {overview.openSessions.map((s) => (
              <option key={s.id} value={s.id}>
                {`Caja #${s.number} · ${s.openedBy} · disponible ${formatMoney(s.cashAvailable)}`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tipo de movimiento">
          <Select name="type">
            {MANUAL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Monto">
          <NumberInput name="amount" defaultValue={formatPesosInput(0)} />
        </Field>
        <Field label="Motivo obligatorio">
          <TextArea name="reason" maxLength={500} />
        </Field>
        <Button type="submit" block formSubmit>
          Registrar movimiento
        </Button>
      </Form>
      {!state.ok && state.message ? <Alert tone="error">{state.message}</Alert> : null}
    </>
  );
}

/**
 * Admin "Administración de caja" (legacy ui/cashier/shift.py `_admin_cash_page`): supervision of the open sessions,
 * the cash ledger, authorized manual movements and the closing audit. There is NO reopen action: a closed cash
 * session is final. Container: owns the one-shot flash; data and the movement action come from the route.
 */
export function CashAdminScreen({ data, actions }: { data: CashAdminData; actions: CashAdminActions }) {
  const [flash, setFlash] = useState<string | null>(null);
  // Bumped after a recorded movement so the form starts empty again (the flash confirms it).
  const [formVersion, setFormVersion] = useState(0);
  const { overview } = data;

  const tabs = [
    {
      id: "sessions",
      label: "Cajas",
      content:
        overview.openSessions.length === 0 ? (
          <Alert tone="info">No hay cajas abiertas.</Alert>
        ) : (
          <RecordList records={overview.openSessions.slice(0, SESSIONS_LIMIT).map(openSessionRecord)} />
        ),
    },
    {
      id: "ledger",
      label: "Libro de efectivo",
      content:
        overview.ledger.length === 0 ? (
          <Alert tone="info">No hay movimientos de efectivo.</Alert>
        ) : (
          <RecordList records={overview.ledger.slice(0, LEDGER_LIMIT).map(ledgerRecord)} />
        ),
    },
    {
      id: "movement",
      label: "Movimiento autorizado",
      content: (
        <ManualMovementForm
          key={formVersion}
          overview={overview}
          action={actions.recordMovement}
          onSubmitted={() => setFlash(null)}
          onSucceeded={(message) => {
            setFlash(message);
            setFormVersion((v) => v + 1);
          }}
        />
      ),
    },
    {
      id: "audit",
      label: "Cierres y auditoría",
      content: (
        <>
          {overview.history.length > 0 ? <RecordList records={overview.history.slice(0, AUDIT_SESSIONS_LIMIT).map(sessionHistoryRecord)} /> : null}
          <Subheader>Eventos</Subheader>
          {overview.events.length > 0 ? (
            <RecordList records={overview.events.slice(0, EVENTS_LIMIT).map(auditEventRecord)} />
          ) : (
            <Alert tone="info">No hay eventos de auditoría.</Alert>
          )}
        </>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Administración de caja" subtitle="Supervisión de cajas, efectivo, movimientos autorizados y auditoría." />
      {flash ? <Alert tone="success">{flash}</Alert> : null}
      <Columns>
        <Metric label="Cajas abiertas" value={String(overview.openSessions.length)} />
        <Metric label="Efectivo disponible" value={formatMoney(overview.cashAvailable)} />
        <Metric label="Ventas de hoy" value={formatMoney(overview.today.sales)} />
        <Metric label="Tickets de hoy" value={String(overview.today.tickets)} />
      </Columns>
      <Tabs tabs={tabs} />
    </>
  );
}
