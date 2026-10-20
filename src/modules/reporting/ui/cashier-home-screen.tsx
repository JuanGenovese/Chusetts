"use client";

import { useRouter } from "next/navigation";
import { formatMoney } from "@/shared/domain/money";
import { Alert, BrandHero, Button, Columns, KpiCard, Subheader, SummaryTable } from "@/shared/ui";
import type { CashierHome } from "../domain";
import type { CashierHomeData } from "./types";

function KpiCards({ home }: { home: CashierHome }) {
  return (
    <>
      <KpiCard label="Ventas de hoy" value={formatMoney(home.sales)} help="Total registrado por este usuario" />
      <KpiCard label="Tickets" value={String(home.ticketCount)} help="Cantidad de ventas cerradas" />
      <KpiCard label="Ticket promedio" value={formatMoney(home.averageTicket)} help="Promedio por ticket" />
    </>
  );
}


/**
 * Cashier "/" (legacy ui/cashier/home.py `cashier_home`): brand hero, open/closed cash alert, 3 KPI cards, quick
 * actions and the latest tickets of the day. Data comes from the route; navigation is the only behaviour.
 */
export function CashierHomeScreen({ data }: { data: CashierHomeData }) {
  const router = useRouter();
  const { openSessionNumber, home } = data;
  const hasOpenCash = openSessionNumber !== null;

  return (
    <>
      <BrandHero text="Caja simplificada para registrar ventas rápido, con la menor cantidad posible de pasos." />
      {hasOpenCash ? (
        <Alert tone="success">Caja #{openSessionNumber} abierta. Ya podés registrar ventas.</Alert>
      ) : (
        <>
          <Alert tone="warning">Caja cerrada. Abrila antes de comenzar a vender.</Alert>
          <Button block onClick={() => router.push("/mi-turno")}>
            Abrir mi caja
          </Button>
        </>
      )}
      <Columns gap="medium">
        <KpiCards home={home} />
      </Columns>
      <div className="cashier-actions-title md">Acciones rápidas</div>
      <Columns gap="large">
        <Button block className="cashier-action" disabled={!hasOpenCash} onClick={() => router.push("/nueva-venta")}>
          Abrir nueva venta
        </Button>
        <Button block variant="secondary" className="cashier-action" onClick={() => router.push("/mis-tickets")}>
          Ver mis tickets
        </Button>
      </Columns>
      <Subheader>Últimos tickets</Subheader>
      {home.tickets.length > 0 ? (
        <SummaryTable
          headers={["Ticket", "Hora", "Items", "Total"]}
          numericColumns={[2, 3]}
          rows={home.tickets.map((t) => [t.ticketId, t.time, String(Math.trunc(t.items)), formatMoney(t.total)])}
        />
      ) : (
        <div className="empty-tickets-box md">Todavía no hay tickets registrados hoy.</div>
      )}
    </>
  );
}
