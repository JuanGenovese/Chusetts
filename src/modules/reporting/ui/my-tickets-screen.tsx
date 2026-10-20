"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatMoney } from "@/shared/domain/money";
import { Alert, Button, Columns, DateInput, Field, Metric, PageHeader, Select, Subheader, SummaryTable, TextArea } from "@/shared/ui";
import type { MyTicketRow, MyTicketsData, TicketVoidAction } from "./types";

const ticketLabel = (t: MyTicketRow) => `${t.ticketId} | ${formatMoney(t.total)} | ${t.time}`;

/**
 * "Mis tickets" (legacy ui/cashier/tickets.py `my_tickets_page`). Container: owns the date filter (kept in the URL so
 * the server reads the tickets), the ticket selection, the reason and the one-shot result message. Data and the void
 * action come from the route.
 */
export function MyTicketsScreen({ data, action }: { data: MyTicketsData; action: TicketVoidAction }) {
  const router = useRouter();
  const [date, setDate] = useState(data.businessDate);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const { tickets } = data;
  const selected = tickets.find((t) => t.ticketId === selectedId) ?? tickets[0];
  const total = tickets.reduce((sum, t) => sum + t.total, 0);

  const changeDate = (iso: string) => {
    setDate(iso);
    setMessage(null);
    startTransition(() => router.push(`/mis-tickets?fecha=${iso}`));
  };

  const submit = () => {
    if (!selected || pending) return;
    startTransition(async () => {
      const result = await action({ ticketId: selected.ticketId, reason });
      setMessage({ ok: result.ok, text: result.message ?? "" });
      if (result.ok) {
        setReason("");
        setSelectedId(null);
      }
    });
  };

  return (
    <>
      <PageHeader title="Mis tickets" subtitle="Consulta de tickets propios y anulación completa del ticket con motivo." />
      <Field label="Fecha">
        <DateInput value={date} onChange={changeDate} />
      </Field>
      {message?.ok ? <Alert tone="success">{message.text}</Alert> : null}
      {tickets.length === 0 || !selected ? (
        <Alert tone="info">No hay tickets activos del usuario para la fecha seleccionada.</Alert>
      ) : (
        <>
          <Columns>
            <Metric label="Ventas del día" value={formatMoney(total)} />
            <Metric label="Tickets" value={String(tickets.length)} />
          </Columns>
          <SummaryTable
            headers={["Ticket", "Hora", "Items", "Total"]}
            numericColumns={[2, 3]}
            rows={tickets.map((t) => [t.ticketId, t.time, String(Math.trunc(t.items)), formatMoney(t.total)])}
          />
          <Subheader>Anular ticket</Subheader>
          <Field label="Ticket a anular">
            <Select value={selected.ticketId} onChange={(e) => setSelectedId(e.target.value)}>
              {tickets.map((t) => (
                <option key={t.ticketId} value={t.ticketId}>
                  {ticketLabel(t)}
                </option>
              ))}
            </Select>
          </Field>
          {selected.lines.length > 0 ? (
            <>
              <div className="soft-note md">Detalle del ticket seleccionado</div>
              <SummaryTable
                headers={["Producto", "Cantidad", "Precio", "Subtotal"]}
                numericColumns={[1, 2, 3]}
                rows={selected.lines.map((l) => [l.productName, String(Math.trunc(l.quantity)), formatMoney(l.unitPrice), formatMoney(l.amount)])}
              />
            </>
          ) : null}
          <Field label="Motivo de anulación">
            <TextArea value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Button block disabled={pending} onClick={submit}>
            Anular ticket completo
          </Button>
          {message && !message.ok ? <Alert tone="error">{message.text}</Alert> : null}
        </>
      )}
    </>
  );
}
