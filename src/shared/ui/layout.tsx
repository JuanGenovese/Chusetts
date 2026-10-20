import type { CSSProperties, ReactNode } from "react";

/** Streamlit `st.columns` gap: small = 1rem (default), medium = 2rem, large = 4rem. */
export type ColumnsGap = "small" | "medium" | "large";

const GAP_REM: Record<ColumnsGap, number> = { small: 1, medium: 2, large: 4 };

/**
 * Streamlit sizes weighted columns as `share * 100% - gap * (n - 1) / n` (not `fr` of the space left after the gaps),
 * which is what makes e.g. [1.55, 1] with a large gap 571px / 357px wide at 1440px.
 */
function weightedTemplate(weights: number[], gap: ColumnsGap): string {
  const total = weights.reduce((a, b) => a + b, 0);
  const subtract = (GAP_REM[gap] * (weights.length - 1)) / weights.length;
  return weights.map((w) => `calc(${(w / total) * 100}% - ${subtract}rem)`).join(" ");
}

/** Row of columns (st.columns): equal width, stacks below 760px. */
export function Columns({ children, gap = "small", weights }: { children: ReactNode; gap?: ColumnsGap; weights?: number[] }) {
  return (
    <div className={`cols cols-${gap}`} style={weights ? ({ "--cols-template": weightedTemplate(weights, gap) } as CSSProperties) : undefined} data-weighted={weights ? "" : undefined}>
      {children}
    </div>
  );
}
