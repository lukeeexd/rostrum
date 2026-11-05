/**
 * Recharts styling in BoardUI's chart-card look, shared by every chart so
 * they match in both themes. Colours are theme variables, never hex.
 */

/** The main series colour (BoardUI's accent chart hue). */
export const CHART_PRIMARY = "var(--color-chart-9-active)";

export const axisTick = { fontSize: 12, fill: "var(--color-text-tertiary)" };

export const tooltipStyle = {
  background: "var(--color-background-primary-default)",
  border: "1px solid var(--color-border-button-default)",
  borderRadius: 10,
  fontSize: 13,
  color: "var(--color-text-primary)",
};

export const tooltipLabelStyle = { color: "var(--color-text-secondary)" };

export const chartCursor = { fill: "var(--color-chart-track)", opacity: 0.5 };

/** A row of coloured dots naming each series. */
export function ChartLegend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-2-medium text-text-secondary">
      {items.map((item) => (
        <div key={item.name} className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: item.color }} aria-hidden />
          <dt>{item.name}</dt>
        </div>
      ))}
    </dl>
  );
}
