"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

export interface TabDefinition {
  id: string;
  label: string;
  content: ReactNode;
}

/** st.tabs: red underline on the active tab; only the active panel is mounted. */
export function Tabs({ tabs }: { tabs: TabDefinition[] }) {
  const base = useId();
  const [active, setActive] = useState(tabs[0]?.id);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((t) => t.id === active);
    const next = event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1 : null;
    if (next === null) return;
    const target = tabs[(next + tabs.length) % tabs.length];
    setActive(target.id);
    document.getElementById(`${base}-tab-${target.id}`)?.focus();
  };

  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  return (
    <div className="tabs">
      <div className="tab-list" role="tablist" onKeyDown={onKeyDown}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`${base}-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={tab.id === current.id}
            aria-controls={`${base}-panel-${tab.id}`}
            tabIndex={tab.id === current.id ? 0 : -1}
            className="tab"
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div id={`${base}-panel-${current.id}`} role="tabpanel" aria-labelledby={`${base}-tab-${current.id}`} className="tab-panel stack">
        {current.content}
      </div>
    </div>
  );
}
