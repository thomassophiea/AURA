/**
 * Merges persisted SLE history from the backend into the live-computed
 * `SLEMetric` objects the dashboard renders.
 *
 * The live values come from the current controller snapshot; the trend comes
 * from PostgreSQL. That split is what makes the trend survive a reload, a
 * redeploy, or a different browser — and what lets it keep showing the previous
 * days while a gateway is down.
 *
 * Gaps are preserved as gaps. A missing bucket is simply absent from the series;
 * it is never emitted as a zero and never interpolated across.
 */

import type { SLEMetric, SLETimeSeriesPoint } from '../../types/sle';
import type { MetricSeries, SeriesGap } from '../../types/monitoring';

/** Backend metric names map 1:1 onto the frontend SLE ids. */
export const SLE_METRIC_FAMILY = 'sle';

export interface SleHistoryMergeResult {
  sles: SLEMetric[];
  /** Gaps per SLE id, so a chart can annotate the break. */
  gapsById: Record<string, SeriesGap[]>;
}

function toTimeSeriesPoint(point: MetricSeries['points'][number]): SLETimeSeriesPoint {
  const timestamp = new Date(point.observedAt).getTime();
  return {
    timestamp,
    time: new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    successRate: point.value ?? 0,
    // Denominator is the entities in scope; numerator is the healthy ones. The
    // affected count is the difference — recovered from the stored parts rather
    // than guessed.
    totalClients: point.denominator ?? 0,
    affectedClients:
      point.denominator !== null && point.numerator !== null
        ? point.denominator - point.numerator
        : 0,
  };
}

/**
 * Attach persisted history to each SLE metric.
 *
 * Metrics with no stored history keep whatever series they already had, so a
 * newly deployed collector degrades to the previous behaviour instead of
 * blanking every trend.
 */
export function mergeSleHistory(sles: SLEMetric[], series: MetricSeries[]): SleHistoryMergeResult {
  const byMetric = new Map<string, MetricSeries[]>();
  for (const entry of series) {
    if (entry.key.metricFamily !== SLE_METRIC_FAMILY) continue;
    const list = byMetric.get(entry.key.metricName) ?? [];
    list.push(entry);
    byMetric.set(entry.key.metricName, list);
  }

  const gapsById: Record<string, SeriesGap[]> = {};

  const merged = sles.map((sle) => {
    const entries = byMetric.get(sle.id);
    if (!entries || entries.length === 0) return sle;

    // Several sites can contribute to one metric when the view is org-scoped.
    // Points are combined by timestamp using the stored numerator/denominator,
    // never by averaging the stored percentages.
    const byTimestamp = new Map<number, { numerator: number; denominator: number }>();
    for (const entry of entries) {
      for (const point of entry.points) {
        if (point.numerator === null || point.denominator === null) continue;
        const timestamp = new Date(point.observedAt).getTime();
        const existing = byTimestamp.get(timestamp) ?? { numerator: 0, denominator: 0 };
        existing.numerator += point.numerator;
        existing.denominator += point.denominator;
        byTimestamp.set(timestamp, existing);
      }
    }

    let timeSeries: SLETimeSeriesPoint[];
    if (byTimestamp.size > 0) {
      timeSeries = [...byTimestamp.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([timestamp, { numerator, denominator }]) => ({
          timestamp,
          time: new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          successRate:
            denominator > 0 ? parseFloat(((numerator / denominator) * 100).toFixed(1)) : 0,
          totalClients: denominator,
          affectedClients: denominator - numerator,
        }));
    } else {
      // No numerator/denominator stored (older rows): fall back to the raw
      // values rather than dropping the trend entirely.
      timeSeries = entries
        .flatMap((entry) => entry.points)
        .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
        .map(toTimeSeriesPoint);
    }

    gapsById[sle.id] = entries.flatMap((entry) => entry.gaps);
    return { ...sle, timeSeries };
  });

  return { sles: merged, gapsById };
}

/** True when any SLE in the view has a gap in its stored history. */
export function hasAnyGap(gapsById: Record<string, SeriesGap[]>): boolean {
  return Object.values(gapsById).some((gaps) => gaps.length > 0);
}
