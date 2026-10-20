"use client";

import { useEffect, useRef, useState } from "react";

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const WEEKDAYS = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"];

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** "2026-10-19" -> "2026/10/19" (how st.date_input displays its value). */
const toDisplay = (iso: string) => iso.replaceAll("-", "/");

function parseTyped(text: string): string | null {
  const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(text.trim());
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return toIso(y, m - 1, d);
}

/**
 * st.date_input: shows `YYYY/MM/DD`, accepts typing and opens a month calendar. `value` is an ISO date
 * (YYYY-MM-DD) and never empty: an invalid typed value reverts to the last valid one.
 */
export function DateInput({ value, onChange, name }: { value: string; onChange: (iso: string) => void; name?: string }) {
  const [open, setOpen] = useState(false);
  // `draft` is what the user is typing; null = show the committed value. `viewOverride` = month being browsed.
  const [draft, setDraft] = useState<string | null>(null);
  const [viewOverride, setViewOverride] = useState<{ year: number; month: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const text = draft ?? toDisplay(value);
  const view = viewOverride ?? { year: Number(value.slice(0, 4)), month: Number(value.slice(5, 7)) - 1 };

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const commit = () => {
    const parsed = draft === null ? null : parseTyped(draft);
    if (parsed) {
      onChange(parsed);
      setViewOverride(null);
    }
    setDraft(null);
  };

  const firstWeekday = new Date(Date.UTC(view.year, view.month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(view.year, view.month + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(view.year, view.month + delta, 1));
    setViewOverride({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
  };

  return (
    <div className="date-input" ref={root}>
      <input
        name={name}
        type="text"
        className="input"
        autoComplete="off"
        value={text}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
            setOpen(false);
          }
          if (event.key === "Escape") setOpen(false);
        }}
      />
      {open ? (
        <div className="calendar" role="dialog" aria-label="Calendario" onMouseDown={(event) => event.preventDefault()}>
          <div className="calendar-head">
            <button type="button" aria-label="Mes anterior" onClick={() => shift(-1)}>
              ‹
            </button>
            <strong>
              {MONTHS[view.month]} {view.year}
            </strong>
            <button type="button" aria-label="Mes siguiente" onClick={() => shift(1)}>
              ›
            </button>
          </div>
          <div className="calendar-grid">
            {WEEKDAYS.map((w) => (
              <span key={w} className="calendar-weekday">
                {w}
              </span>
            ))}
            {cells.map((day, index) =>
              day === null ? (
                <span key={`blank-${index}`} />
              ) : (
                <button
                  key={`day-${day}`}
                  type="button"
                  className="calendar-day"
                  aria-pressed={toIso(view.year, view.month, day) === value}
                  onClick={() => {
                    onChange(toIso(view.year, view.month, day));
                    setViewOverride(null);
                    setDraft(null);
                    setOpen(false);
                  }}
                >
                  {day}
                </button>
              ),
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
