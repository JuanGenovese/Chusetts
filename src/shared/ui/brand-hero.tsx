/** Legacy `brand_hero`: the header card of the home screens. */
export function BrandHero({ text }: { text: string }) {
  return (
    <div className="brand-shell md">
      <div className="brand-title">chusetts</div>
      <div className="brand-tagline">
        donde <span className="pinta">pinta</span> quedarse
      </div>
      <div className="brand-text">{text}</div>
    </div>
  );
}
