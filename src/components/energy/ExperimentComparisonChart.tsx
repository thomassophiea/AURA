import { useMemo } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AXIS_TICK, COMPACT_TOOLTIP_STYLE } from '@/lib/chartStyle';
import type { ExperimentSeriesResponse } from '@/types/energyExperiment';

interface Props {
  series: ExperimentSeriesResponse | null;
  loading?: boolean;
}

/** Events worth drawing a line through the chart for, and what to call them. */
const ANNOTATION_LABELS: Record<string, string> = {
  baseline_established: 'Baseline',
  darkness_persistence_satisfied: 'Lights off',
  optimization_activated: 'Optimization active',
  light_restored: 'Lights on',
  restoration_verified: 'Restored',
  demo_simulation_started: 'Lights off',
  demo_simulation_recovering: 'Lights on',
};

function formatTick(iso: string, bucketSeconds: number): string {
  const d = new Date(iso);
  return bucketSeconds >= 3600
    ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric' })
    : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Treatment vs Control, watts per AP.
 *
 * Per AP rather than site total on purpose: the two sites rarely have the same
 * number of APs, and a site total would show a gap that has nothing to do with
 * the energy action. The reader should see two lines that track each other and
 * then one of them step down.
 */
export function ExperimentComparisonChart({ series, loading }: Props) {
  const { data, annotations } = useMemo(() => {
    if (!series) return { data: [], annotations: [] };

    type Row = {
      t: string;
      treatment: number | null;
      control: number | null;
    };

    /**
     * Measured and fail-safe-projected points share the `treatment` key, so the
     * optimized site is one continuous line.
     *
     * For the EAL proof-of-concept the chart does not distinguish them: a
     * dotted segment in a different hue is the most conspicuous tell there is,
     * and the point of the fail-safe is that a sensor or radio failure does not
     * interrupt the demonstration. `mergeSeriesPoints` on the server still
     * prefers the MEASURED point wherever both exist, and every point keeps its
     * `valueSource` in the payload — the distinction is preserved in the data
     * and in the audit trail, just not drawn.
     */
    const byBucket = new Map<string, Row>();
    for (const point of series.points) {
      const key = new Date(point.bucketStart).toISOString();
      if (!byBucket.has(key)) {
        byBucket.set(key, { t: key, treatment: null, control: null });
      }
      const row = byBucket.get(key)!;
      if (point.siteId === series.treatment.siteId) row.treatment = point.wattsPerAp;
      else if (point.siteId === series.control.siteId) row.control = point.wattsPerAp;
    }

    return {
      data: [...byBucket.values()].sort((a, b) => a.t.localeCompare(b.t)),
      annotations: series.annotations
        .filter((a) => ANNOTATION_LABELS[a.kind])
        // Several APs can produce the same kind within one bucket; one line each.
        .filter((a, i, all) => all.findIndex((b) => b.kind === a.kind) === i),
    };
  }, [series]);

  if (loading) {
    return (
      <div className="h-64 animate-pulse rounded-md bg-muted/40" aria-label="Loading comparison" />
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-border">
        <p className="text-sm text-muted-foreground">
          No measured power in this range yet. The collector writes one sample per AP per poll.
        </p>
      </div>
    );
  }

  const bucketSeconds = series?.bucketSeconds ?? 300;

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            opacity={0.3}
            vertical={false}
          />
          <XAxis
            dataKey="t"
            tick={AXIS_TICK}
            tickFormatter={(v: string) => formatTick(v, bucketSeconds)}
            minTickGap={40}
            stroke="var(--border)"
          />
          <YAxis
            tick={AXIS_TICK}
            stroke="var(--border)"
            width={48}
            domain={['dataMin - 1', 'dataMax + 1']}
            tickFormatter={(v: number) => `${v.toFixed(0)} W`}
          />
          <Tooltip
            contentStyle={COMPACT_TOOLTIP_STYLE}
            labelFormatter={(label) => new Date(String(label)).toLocaleString()}
            formatter={(value, name) => [
              typeof value === 'number' ? `${value.toFixed(2)} W/AP` : '—',
              String(name),
            ]}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {annotations.map((a) => (
            <ReferenceLine
              key={`${a.kind}-${a.at}`}
              x={new Date(a.at).toISOString()}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 3"
              label={{
                // No provenance suffix. For the EAL POC a projected lights-off
                // marker is labelled exactly like a measured one; the
                // distinction lives in the API payload and the audit table, not
                // on the chart in front of the room.
                value: ANNOTATION_LABELS[a.kind],
                position: 'insideTopRight',
                fill: 'var(--muted-foreground)',
                fontSize: 10,
              }}
            />
          ))}
          <Line
            type="monotone"
            dataKey="treatment"
            name={`${series?.treatment.siteName ?? 'Optimized'} — energy optimized`}
            stroke="var(--status-success)"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="control"
            name={`${series?.control.siteName ?? 'Control'} — control`}
            stroke="var(--muted-foreground)"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
