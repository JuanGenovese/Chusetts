import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

/** Label + control (Streamlit widget label above the input). */
export function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <label className="field">
      {help ? (
        <span className="field-head">
          <span className="field-label">{label}</span>
          <span className="field-help" title={help} aria-label={help}>
            ?
          </span>
        </span>
      ) : (
        <span className="field-label">{label}</span>
      )}
      {children}
    </label>
  );
}

export function TextInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="text" {...props} className={`input ${className}`} />;
}

/**
 * Numeric input as the legacy app shows it: typed value only (steppers hidden), Spanish decimal comma
 * ("5000,00"). It is a text input so the browser locale never changes the displayed format.
 */
export function NumberInput({ className = "", ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return <input {...props} type="text" inputMode="decimal" autoComplete="off" className={`input ${className}`} />;
}

export function TextArea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`textarea ${className}`} />;
}

export function Select({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`select ${className}`}>
      {children}
    </select>
  );
}
