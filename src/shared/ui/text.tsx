import type { ReactNode } from "react";

/** st.subheader */
export function Subheader({ children }: { children: ReactNode }) {
  return (
    <div className="md">
      <h3 className="subheader">{children}</h3>
    </div>
  );
}

/** st.caption */
export function Caption({ children }: { children: ReactNode }) {
  return <p className="caption">{children}</p>;
}

/** st.write / st.markdown plain paragraph */
export function Paragraph({ children }: { children: ReactNode }) {
  return <p className="body-text">{children}</p>;
}

/** st.divider */
export function Divider() {
  return <hr className="divider" />;
}
