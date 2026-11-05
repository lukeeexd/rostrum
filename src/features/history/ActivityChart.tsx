import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ActivityBucket } from "@/api/types";
import { axisTick, CHART_PRIMARY, ChartLegend, chartCursor, tooltipLabelStyle, tooltipStyle } from "@/components/shared/chart";
import { formatClock, formatInt } from "@/lib/format";

const DEAD = "var(--color-rose-500)";

/** Hourly probes over the last 24h, dead streams found alongside. */
export function ActivityChart({ activity }: { activity: ActivityBucket[] }) {
  const data = activity.map((b) => ({ ...b, label: formatClock(b.from) }));
  const total = activity.reduce((n, b) => n + b.probed, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-title-1-medium text-text-primary tabular-nums">{formatInt(total)}</p>
          <p className="text-body-2-medium text-text-tertiary">streams probed in the last 24 hours</p>
        </div>
        <ChartLegend
          items={[
            { name: "Probed", color: CHART_PRIMARY },
            { name: "Dead found", color: DEAD },
          ]}
        />
      </div>
      <div className="h-56 w-full" role="img" aria-label={`Hourly probes over the last 24 hours, ${total} in total`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 0 }} barCategoryGap="22%" barGap={2}>
            <YAxis width={36} allowDecimals={false} tickLine={false} axisLine={false} tick={axisTick} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              interval="preserveStartEnd"
              minTickGap={24}
              tick={axisTick}
            />
            <Tooltip cursor={chartCursor} contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} />
            <Bar dataKey="probed" name="Probed" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="dead" name="Dead found" fill={DEAD} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
