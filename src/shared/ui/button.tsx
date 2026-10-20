import type { ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** `secondary` is visually distinct from the orange primary (approved deviation). */
  variant?: "primary" | "secondary";
  /** Full-width button (Streamlit `width="stretch"`). */
  block?: boolean;
  /** Streamlit form-submit typography (17px / 850). */
  formSubmit?: boolean;
}

export function Button({ variant = "primary", block = false, formSubmit = false, className = "", ...props }: ButtonProps) {
  const classes = ["btn", variant === "primary" ? "btn-primary" : "btn-secondary", formSubmit ? "btn-form" : "", block ? "btn-block" : "", className]
    .filter(Boolean)
    .join(" ");
  return <button type="button" {...props} className={classes} />;
}
