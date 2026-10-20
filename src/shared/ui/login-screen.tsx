"use client";

import { useActionState, useState } from "react";
import { Alert } from "./alert";
import type { ActionState } from "./action-state";

export interface LoginScreenProps {
  /** False while the `users` table is empty: legacy shows a warning instead of the form. */
  hasUsers: boolean;
  /** Message of the legacy "no users" warning. */
  noUsersMessage: string;
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {off ? (
        <>
          <path d="M10.7 5.1A10.4 10.4 0 0 1 12 5c6 0 9.5 7 9.5 7a15.6 15.6 0 0 1-2.2 3M6.6 6.6A15.7 15.7 0 0 0 2.5 12S6 19 12 19a9.7 9.7 0 0 0 5.4-1.6" />
          <path d="M14.1 14.1A3 3 0 0 1 9.9 9.9M2 2l20 20" />
        </>
      ) : (
        <>
          <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

/** Legacy `ui/login.py` + `styles/login.css`: brand card, orange credentials panel and the error below it. */
export function LoginScreen({ hasUsers, noUsersMessage, action }: LoginScreenProps) {
  const [state, formAction] = useActionState(action, { ok: true } satisfies ActionState);
  // Controlled: like Streamlit widgets, the typed values survive a failed attempt.
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);

  return (
    <main className="block-container login-main">
      <div className="login-columns">
        <div className="login-column stack">
          <div className="login-wrap md" style={{ ["--mb" as string]: "19px" }}>
            <div className="login-brand">
              <div className="login-pill">Sistema de gestión local</div>
              <h1 className="login-title">chusetts</h1>
              <div className="login-tagline">
                donde <span className="pinta">pinta</span> quedarse
              </div>
              <div className="login-text">Ingresá con tu usuario para continuar.</div>
            </div>
          </div>

          {hasUsers ? (
            <form className="login-panel" action={formAction}>
              <label className="login-field">
                <span className="login-label">Usuario</span>
                <span className="login-input">
                  <input
                    name="username"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </span>
              </label>
              <label className="login-field">
                <span className="login-label">Contraseña</span>
                <span className="login-input">
                  <input
                    name="password"
                    type={reveal ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button type="button" className="login-eye" aria-label={reveal ? "Ocultar contraseña" : "Mostrar contraseña"} onClick={() => setReveal((v) => !v)}>
                    <EyeIcon off={reveal} />
                  </button>
                </span>
              </label>
              <button type="submit" className="login-button">
                Ingresar
              </button>
            </form>
          ) : (
            <Alert tone="warning">{noUsersMessage}</Alert>
          )}

          {state.ok ? null : <Alert tone="error">{state.message}</Alert>}
        </div>
      </div>
    </main>
  );
}
