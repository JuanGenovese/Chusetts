import { Card } from "@/shared/ui";
import { CashSessionSummary } from "./cash-session-summary";
import { CloseSessionForm } from "./close-session-form";
import { ManualMovementForm } from "./manual-movement-form";
import { OpenSessionForm } from "./open-session-form";
import type { CashActions, CashPageData } from "./types";

/** Page-level composition for /caja. Data and Server Actions are injected by the (thin) route. */
export function CashPage({ data, actions }: { data: CashPageData; actions: CashActions }) {
  const { overview, user } = data;
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Caja</h1>
        <span className="text-sm text-zinc-500">{user.displayName}</span>
      </header>
      {overview === null ? (
        <Card title="Abrir caja">
          <p className="mb-3 text-sm text-zinc-600">No tiene una caja abierta. Ingrese el efectivo inicial para comenzar el turno.</p>
          <OpenSessionForm action={actions.open} />
        </Card>
      ) : (
        <>
          <Card title="Caja abierta">
            <CashSessionSummary overview={overview} />
          </Card>
          {user.role === "admin" ? (
            <Card title="Registrar movimiento manual">
              <ManualMovementForm action={actions.recordMovement} />
            </Card>
          ) : null}
          <Card title="Cerrar caja">
            <CloseSessionForm action={actions.close} />
          </Card>
        </>
      )}
    </main>
  );
}
