import type { InputHTMLAttributes } from "react";

/** st.checkbox */
export function Checkbox({ label, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string }) {
  return (
    <label className="checkbox">
      <input {...props} type="checkbox" />
      <span className="checkbox-box" aria-hidden />
      <span className="checkbox-label">{label}</span>
    </label>
  );
}
