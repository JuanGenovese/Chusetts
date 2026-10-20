import type { CSSProperties } from "react";
import { Caption } from "./text";

export interface RecordItem {
  /** Unique, stable key (never derived from content that can repeat). */
  key: string;
  title: string;
  subtitle?: string;
  fields: { label: string; value: string }[];
}

/** Legacy `record_list`: bordered rows with a title/subtitle on the left and labelled values on the right. */
export function RecordList({ records }: { records: RecordItem[] }) {
  return (
    <>
      {records.map((record) => (
        <div key={record.key} className="record">
          <div className="record-col">
            <p className="record-title">{record.title}</p>
            {record.subtitle ? <Caption>{record.subtitle}</Caption> : null}
          </div>
          <div
            className="record-fields"
            style={{ "--record-cols": Math.min(Math.max(record.fields.length, 1), 4) } as CSSProperties}
          >
            {record.fields.map((field) => (
              <div key={field.label} className="record-col">
                <Caption>{field.label}</Caption>
                <p className="body-text">{field.value}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
