"use client";

import { useActionState, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { formatTimestamp } from "@/shared/domain/datetime";
import { Alert, Button, Caption, Field, Form, PageHeader, Paragraph, Select, SummaryTable, Subheader, TextInput, type ActionState } from "@/shared/ui";
import { roleLabel } from "../domain";
import { EXPORT_HREF, type AdministrationActions, type AdministrationData, type FormAction } from "./types";

const initial: ActionState = { ok: false };


/**
 * One form's submit cycle: runs the action inside a transition (so React does not reset the typed values when the
 * server rejects them), and remounts the form (`version`) after a success so every field starts empty again.
 */
function useFormFlow(action: FormAction) {
  const [version, setVersion] = useState(0);
  const [state, dispatch] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.ok) setVersion((v) => v + 1);
    return result;
  }, initial);
  const [pending, startTransition] = useTransition();
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    startTransition(() => dispatch(data));
  };
  return { state, pending, onSubmit, version };
}

function Feedback({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>;
}

function CreateUserForm({ action }: { action: FormAction }) {
  const { state, pending, onSubmit, version } = useFormFlow(action);
  return (
    <>
      <Form key={version} onSubmit={onSubmit} aria-busy={pending}>
        <Field label="Nombre de usuario">
          <TextInput name="username" autoComplete="off" />
        </Field>
        <Field label="Nombre visible">
          <TextInput name="displayName" autoComplete="off" />
        </Field>
        <Field label="Rol">
          <Select name="role" defaultValue="cajero">
            <option value="cajero">cajero</option>
            <option value="admin">admin</option>
          </Select>
        </Field>
        <Field label="Contraseña inicial">
          <TextInput type="password" name="password" autoComplete="new-password" />
        </Field>
        <Field label="Repetir contraseña inicial">
          <TextInput type="password" name="passwordRepeat" autoComplete="new-password" />
        </Field>
        <Button type="submit" block formSubmit disabled={pending}>
          Crear usuario
        </Button>
      </Form>
      <Feedback state={state} />
    </>
  );
}

function ResetPasswordForm({ users, action }: { users: AdministrationData["users"]; action: FormAction }) {
  const { state, pending, onSubmit, version } = useFormFlow(action);
  return (
    <>
      <Form key={version} onSubmit={onSubmit} aria-busy={pending}>
        <Field label="Usuario">
          <Select name="username">
            {users.map((u) => (
              <option key={u.id} value={u.username}>
                {`${u.displayName} (${u.username})`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nueva contraseña temporal">
          <TextInput type="password" name="newPassword" autoComplete="new-password" />
        </Field>
        <Field label="Repetir contraseña temporal">
          <TextInput type="password" name="newPasswordRepeat" autoComplete="new-password" />
        </Field>
        <Button type="submit" block formSubmit disabled={pending}>
          Restablecer contraseña
        </Button>
      </Form>
      <Feedback state={state} />
    </>
  );
}

/** st.expander: collapsed by default. */
function Expander({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="expander">
      <summary>{title}</summary>
      <div className="expander-body">{children}</div>
    </details>
  );
}

/**
 * Admin "Administración" (legacy ui/admin/settings.py): users, user creation, password reset + audit, data export and
 * the operating checklist. Not ported on purpose: "Base activa" (no local file) and "Servidor local" (hosted app).
 */
export function AdministrationScreen({ data, actions }: { data: AdministrationData; actions: AdministrationActions }) {
  // The server refuses it anyway; hiding developer accounts just keeps the select free of options that always fail.
  const resetTargets = data.canResetDevelopers ? data.users : data.users.filter((u) => u.role !== "developer");
  return (
    <>
      <PageHeader title="Administración" subtitle="Estado técnico, usuarios y recomendaciones operativas." />
      <Subheader>Usuarios del sistema</Subheader>
      <SummaryTable
        headers={["Usuario", "Nombre visible", "Rol", "Activo", "Creado"]}
        rows={data.users.map((u) => [u.username, u.displayName, roleLabel(u.role), u.isActive ? "Sí" : "No", formatTimestamp(u.createdAt)])}
      />

      <Subheader>Crear usuario</Subheader>
      <Caption>Uso normal recomendado: crear usuarios desde esta pantalla. Los scripts quedan solo como emergencia técnica.</Caption>
      <CreateUserForm action={actions.createUser} />

      <Subheader>Restablecer contraseña</Subheader>
      <Caption>El administrador define una contraseña temporal. La contraseña anterior deja de funcionar inmediatamente.</Caption>
      {resetTargets.length > 0 ? <ResetPasswordForm users={resetTargets} action={actions.resetPassword} /> : null}

      <Expander title="Auditoría de cambios de contraseña">
        <SummaryTable
          headers={["Usuario", "Tipo", "Realizado por", "Fecha y hora"]}
          rows={data.events.map((e) => [e.username, e.type, e.performedBy, formatTimestamp(e.occurredAt)])}
        />
      </Expander>

      {data.canExportData ? (
        <>
          <Subheader>Exportar datos</Subheader>
          <Caption>Descarga un archivo JSON con todos los datos de la aplicación. No incluye contraseñas ni credenciales.</Caption>
          <a className="btn btn-primary btn-block btn-link" href={EXPORT_HREF} download>
            Descargar exportación de datos
          </a>
        </>
      ) : null}
    </>
  );
}
