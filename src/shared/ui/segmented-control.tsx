"use client";

/** st.segmented_control (single selection, always one selected). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={option === value}
          className="segmented-option"
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
