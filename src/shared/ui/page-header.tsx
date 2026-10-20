/** Legacy `page_header`: card with the page title and subtitle. */
export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="page-card md">
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  );
}
