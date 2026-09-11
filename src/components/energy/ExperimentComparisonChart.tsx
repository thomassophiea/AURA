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
};

function formatTick(iso: string, bucketSeconds: number): string {
  const d = new Date(iso);
  return bucketSeconds >= 3600
    ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric' })
    : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * North vs South, watts per AP.
 *
 * Per AP rather than site total on purpose: the two sites rarely have the same
 * number of APs, and a site total would show a gap that has nothing to do with
 * the energy action. The reader should see two lines that track each other and
 * then one of them step down.
 */
export function ExperimentComparisonChart({ series, loading }: Props) {
  const { data, annotations } = useMemo(() => {
    if (!series) return { data: [], annotations: [] };

    const byBucket = new Map<string, { t: string; north: number | null; south: number | null }>();
    for (const point of series.points) {
      const key = new Date(point.bucketStart).toISOString();
      if (!byBucket.has(key)) byBucket.set(key, { t: key, north: null, south: null });
      const row = byBucket.get(key)!;
      if (point.siteId === series.north.siteId) row.north = point.wattsPerAp;
      else if (point.siteId === series.south.siteId) row.south = point.wattsPerAp;
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
    return <div className="h-64 animate-pulse rounded-md bg-muted/40" aria-label="Loading comparison" />;
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
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} vertical={false} />
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
                value:
                  ANNOTATION_LABELS[a.kind] + (a.provenance === 'simulated' ? ' (sim)' : ''),
                position: 'insideTopRight',
                fill: 'var(--muted-foreground)',
                fontSize: 10,
              }}
            />
          ))}
          <Line
            type="monotone"
            dataKey="north"
            name={`${series?.north.siteName ?? 'North'} (treatment)`}
            stroke="var(--status-success)"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="south"
            name={`${series?.south.siteName ?? 'South'} (control)`}
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
