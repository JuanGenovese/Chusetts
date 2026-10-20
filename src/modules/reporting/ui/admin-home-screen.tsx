"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { formatPercent } from "@/shared/domain/format";
import { formatMoney } from "@/shared/domain/money";
import {
  Alert,
  BrandHero,
  Columns,
  Dialog,
  Divider,
  KpiCard,
  Metric,
  QuickActionCard,
  QuickActions,
  RecordList,
  Subheader,
  Tabs,
  ToastHost,
  useToast,
  type TabDefinition,
} from "@/shared/ui";
import type { AdminDashboard } from "../domain";
import { BarChart, PieChart } from "./charts";
import { monthRecord, stockRecord, todayRecord } from "./mappers";
import type { AdminHomeActions, AdminHomeDialogs } from "./types";

type DialogKind = keyof AdminHomeDialogs;

const DIALOG_TITLES: Record<DialogKind, string> = {
  expense: "Cargar movimiento",
  purchase: "Cargar movimiento",
  product: "Nuevo producto",
};

function TodayTab({ today }: { today: AdminDashboard["today"] }) {
  return (
    <>
      <Columns>
        <Metric label="Ventas hoy" value={formatMoney(today.sales)} />
        <Metric label="Egresos hoy" value={formatMoney(today.expenses)} />
        <Metric label="Resultado hoy" value={formatMoney(today.result)} />
        <Metric label="Margen estimado" value={formatPercent(today.margin)} />
      </Columns>
      {today.isEmpty ? (
        <Alert tone="info">Todavía no hay movimientos cargados hoy.</Alert>
      ) : (
        <Columns>
          <div>
            {today.salesByPaymentMethod.length > 0 ? (
              <BarChart
                title="Ventas por medio de pago"
                xTitle="medio_pago"
                yTitle="importe"
                data={today.salesByPaymentMethod.map((s) => ({ label: s.paymentMethod, value: s.amount / 100, tooltip: `${s.paymentMethod}: ${formatMoney(s.amount)}` }))}
              />
            ) : null}
          </div>
          <div className="stack">
            <RecordList records={today.recentMovements.map(todayRecord)} />
          </div>
        </Columns>
      )}
    </>
  );
}

function MonthTab({ month }: { month: AdminDashboard["month"] }) {
  return (
    <>
      <Columns>
        <Metric label="Ventas del mes" value={formatMoney(month.sales)} />
        <Metric label="Egresos del mes" value={formatMoney(month.expenses)} />
        <Metric label="Resultado estimado" value={formatMoney(month.result)} />
        <Metric label="Margen estimado" value={formatPercent(month.margin)} />
      </Columns>
      {month.isEmpty ? (
        <Alert tone="info">Todavía no hay movimientos cargados este mes.</Alert>
      ) : (
        <>
          <Columns>
            <div>
              {month.salesByDay.length > 0 ? (
                <BarChart
                  title="Ventas por día"
                  xTitle="Fecha"
                  yTitle="Importe"
                  axis="date"
                  data={month.salesByDay.map((s) => ({ label: s.date, value: s.amount / 100, tooltip: `${s.date}: ${formatMoney(s.amount)}` }))}
                />
              ) : null}
            </div>
            <div>
              {month.expensesByCategory.length > 0 ? (
                <PieChart
                  title="Egresos por categoría"
                  data={month.expensesByCategory.map((e) => ({ label: e.category, value: e.amount, tooltip: `${e.category}: ${formatMoney(e.amount)}` }))}
                />
              ) : null}
            </div>
          </Columns>
          <div className="stack">
            <RecordList records={month.recentMovements.map(monthRecord)} />
          </div>
        </>
      )}
    </>
  );
}

function StockTab({ stock }: { stock: AdminDashboard["stock"] }) {
  if (stock.isEmpty) return <Alert tone="info">No hay productos cargados.</Alert>;
  return (
    <>
      <Columns>
        <Metric label="Productos activos" value={String(stock.activeProducts)} />
        <Metric label="Stock crítico" value={String(stock.criticalCount)} />
        <Metric label="Margen promedio unitario" value={formatMoney(stock.averageUnitMargin)} />
      </Columns>
      <div className="stack">
        <RecordList records={stock.products.map(stockRecord)} />
      </div>
    </>
  );
}

function AdminHomeBody({ dashboard, actions, dialogs }: { dashboard: AdminDashboard; actions: AdminHomeActions; dialogs: AdminHomeDialogs }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState<DialogKind | null>(null);
  const [, startTransition] = useTransition();

  const closeCash = () =>
    startTransition(async () => {
      const result = await actions.checkOpenCash();
      if (result.ok && result.hasOpenSession) router.push("/cierre-de-caja");
      else toast(result.message ?? '⚠️ No hay cajas abiertas todavía. Iniciá una desde "Mi turno".', "🪙");
    });

  const tabs: TabDefinition[] = [
    { id: "today", label: "Hoy", content: <TodayTab today={dashboard.today} /> },
    { id: "month", label: "Mes actual", content: <MonthTab month={dashboard.month} /> },
    { id: "stock", label: "Stock", content: <StockTab stock={dashboard.stock} /> },
  ];

  const dialogBody: ReactNode = open ? dialogs[open] : null;
  return (
    <>
      <BrandHero text="Vista administrativa para seguimiento integral de operación, caja, stock y performance." />
      <Columns>
        <KpiCard label="Ventas hoy" value={formatMoney(dashboard.today.sales)} help="Ingresos registrados" />
        <KpiCard label="Egresos hoy" value={formatMoney(dashboard.today.expenses)} help="Gastos y compras" />
        <KpiCard label="Resultado hoy" value={formatMoney(dashboard.today.result)} help="Ventas menos egresos" />
        <KpiCard label="Ventas mes" value={formatMoney(dashboard.month.sales)} help="Acumulado mensual" />
      </Columns>
      <Subheader>Accesos rápidos</Subheader>
      <QuickActions>
        <QuickActionCard onClick={() => setOpen("expense")}>Cargar gasto</QuickActionCard>
        <QuickActionCard onClick={() => setOpen("purchase")}>Cargar compra</QuickActionCard>
        <QuickActionCard onClick={() => setOpen("product")}>Cargar producto</QuickActionCard>
        <QuickActionCard onClick={closeCash}>Cerrar caja</QuickActionCard>
      </QuickActions>
      <Divider />
      <Tabs tabs={tabs} />
      {open ? (
        <Dialog title={DIALOG_TITLES[open]} onClose={() => setOpen(null)}>
          {dialogBody}
        </Dialog>
      ) : null}
    </>
  );
}

/**
 * Admin "/" (legacy ui/admin/home.py + dashboard.py): hero, 4 KPI cards, quick-access cards that open the
 * quick-entry / product dialogs, and the Hoy / Mes actual / Stock tabs. The dialog bodies are injected by the route
 * (they belong to the ledger and catalog modules); this container only owns which one is open.
 */
export function AdminHomeScreen(props: { dashboard: AdminDashboard; actions: AdminHomeActions; dialogs: AdminHomeDialogs }) {
  return (
    <ToastHost>
      <AdminHomeBody {...props} />
    </ToastHost>
  );
}
