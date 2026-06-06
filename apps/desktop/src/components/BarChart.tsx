type BarItem = { label: string; value: number; color?: string };

export function BarChart({
  items,
  height = 160,
  formatValue,
}: {
  items: BarItem[];
  height?: number;
  formatValue?: (v: number) => string;
}) {
  if (items.length === 0) {
    return <div className="chart-empty">Aucune donnée à afficher</div>;
  }
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);
  const fmt = formatValue ?? ((v: number) => v.toLocaleString('fr-FR'));

  return (
    <div className="bar-chart" style={{ height }}>
      {items.map((item) => {
        const pct = (Math.abs(item.value) / max) * 100;
        return (
          <div key={item.label} className="bar-chart-col">
            <div className="bar-chart-value">{fmt(item.value)}</div>
            <div className="bar-chart-track">
              <div
                className="bar-chart-fill"
                style={{
                  height: `${pct}%`,
                  background: item.color ?? 'var(--accent)',
                }}
              />
            </div>
            <div className="bar-chart-label">{item.label}</div>
          </div>
        );
      })}
    </div>
  );
}
