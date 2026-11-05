import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisTick, ChartLegend, tooltipLabelStyle, tooltipStyle } from "@/components/shared/chart";
import type { Row } from "./lib/series";

export interface Series {
  key: string;
  name: string;
  /** A CSS colour, normally a theme variable. */
  color: string;
}

/**
 * A line chart (or a stacked area, for parts of a whole) over time, in the
 * shared chart styling. No animation: it would replay on every refetch.
 */
export function TrendChart({
  rows,
  series,
  kind = "line",
  tick,
  label,
  format,
  axisFormat = format,
  domain,
  description,
}: {
  rows: Row[];
  series: Series[];
  kind?: "line" | "stacked";
  /** X axis labels. */
  tick: (t: number) => string;
  /** Tooltip heading. */
  label: (t: number) => string;
  /** Values in the tooltip, and on the Y axis unless `axisFormat` is given. */
  format: (v: number) => string;
  /** Shorter Y axis labels (e.g. without the unit, which the card title carries). */
  axisFormat?: (v: number) => string;
  domain?: [number | "auto", number | "auto"];
  /** Read out for screen readers in place of the drawing. */
  description: string;
}) {
  const Chart = kind === "stacked" ? AreaChart : LineChart;
  return (
    <div className="flex flex-col gap-3">
      <div className="h-56 w-full" role="img" aria-label={description}>
        <ResponsiveContainer width="100%" height="100%">
          <Chart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-separator-border)" />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={tick}
              tickLine={false}
              axisLine={false}
              minTickGap={48}
              tick={axisTick}
            />
            <YAxis width={48} domain={domain} tickFormatter={axisFormat} tickLine={false} axisLine={false} tick={axisTick} />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              labelFormatter={(t) => label(Number(t))}
              formatter={(v) => (typeof v === "number" ? format(v) : String(v))}
            />
            {series.map((s) =>
              kind === "stacked" ? (
                <Area
                  key={s.key}
                  dataKey={s.key}
                  name={s.name}
                  stackId="all"
                  stroke={s.color}
                  fill={s.color}
                  fillOpacity={0.35}
                  isAnimationActive={false}
                />
              ) : (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  name={s.name}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ),
            )}
          </Chart>
        </ResponsiveContainer>
      </div>
      <ChartLegend items={series} />
    </div>
  );
}
