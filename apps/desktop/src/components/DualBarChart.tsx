type Point = { label: string; recettes: number; depenses: number };

export function DualBarChart({ points, height = 180 }: { points: Point[]; height?: number }) {
  if (points.length === 0) {
    return <div className="chart-empty">Aucune donnée à afficher</div>;
  }
  const max = Math.max(
    ...points.flatMap((p) => [Math.abs(p.recettes), Math.abs(p.depenses)]),
    1
  );

  return (
    <div className="dual-bar-chart" style={{ height }}>
      {points.map((p) => (
        <div key={p.label} className="dual-bar-col">
          <div className="dual-bar-pair">
            <div className="dual-bar-track">
              <div
                className="dual-bar-fill positive"
                style={{ height: `${(Math.abs(p.recettes) / max) * 100}%` }}
                title={`Recettes: ${p.recettes}`}
              />
            </div>
            <div className="dual-bar-track">
              <div
                className="dual-bar-fill negative"
                style={{ height: `${(Math.abs(p.depenses) / max) * 100}%` }}
                title={`Dépenses: ${p.depenses}`}
              />
            </div>
          </div>
          <div className="dual-bar-label">{p.label}</div>
        </div>
      ))}
      <div className="dual-bar-legend">
        <span><i className="legend-dot positive" /> Recettes</span>
        <span><i className="legend-dot negative" /> Dépenses</span>
      </div>
    </div>
  );
}
