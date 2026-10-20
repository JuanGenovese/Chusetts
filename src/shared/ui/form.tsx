import type { FormHTMLAttributes } from "react";

/** st.form: card container; children are stacked with Streamlit's 1rem gap. */
export function Form({ className = "", children, ...props }: FormHTMLAttributes<HTMLFormElement>) {
  return (
    <form {...props} className={`form-card stack ${className}`}>
      {children}
    </form>
  );
}
