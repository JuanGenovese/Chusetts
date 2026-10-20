/** Legacy `kpi_card`: uppercase label, big value and a help line. */
export function KpiCard({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <div className="kpi-card md">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-help">{help}</div>
    </div>
  );
}
