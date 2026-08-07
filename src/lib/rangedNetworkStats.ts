/**
 * Headline network figures for a *window*, derived from persisted history.
 *
 * The dashboard's KPI tiles used to be pure current-state: they came from a live
 * `/v1/stations` + `/v1/aps` snapshot, so every one of them read exactly the same
 * whether you selected "Last 15 minutes", "Last 7 days" or "Yesterday". The time
 * control looked broken because, for those tiles, it was.
 *
 * The store already holds what is needed. `sleNormalizer` persists a numerator
 * and denominator with every SLE sample precisely so counts can be recomputed
 * later: `ap_health` carries (healthy APs, total APs) and `successful_connects`
 * carries (authenticated stations, total stations), per site, per collection
 * tick. The `throughput` family carries the byte rates.
 *
 * ## The aggregation that matters
 *
 * **Sum across series at each timestamp, then average across timestamps.** Never
 * the other way round, and never a flat average of every row.
 *
 * This is not a stylistic preference. On the live deployment `ap_health` has two
 * site series per tick — one site with 4 APs, one with 2. A flat
 * `avg(denominator)` over all rows returns **3**, which is neither site and not
 * the fleet. Summing per tick first returns **6**, which is the fleet. The same
 * trap applies to every metric here the moment a second site starts reporting.
 */

import type { MetricSeries } from '../types/monitoring';

/** Metric names this module reads. */
export const RANGED_STAT_METRICS = [
  'ap_health',
  'successful_connects',
  'totalUpload',
  'totalDownload',
] as const;

export interface RangedNetworkStats {
  /** Mean AP count across the window; null when nothing was stored. */
  apTotal: number | null;
  /** Highest AP count seen in the window. */
  apPeak: number | null;
  /** Mean count of healthy APs. */
  apOnline: number | null;
  /** Mean station count across the window. */
  clientTotal: number | null;
  /** Highest station count seen in the window. */
  clientPeak: number | null;
  /** Mean count of authenticated stations. */
  clientAuthenticated: number | null;
  /** Mean upload rate, bits/s. */
  throughputUpload: number | null;
  /** Mean download rate, bits/s. */
  throughputDownload: number | null;
  /** Collection ticks that contributed. 0 means nothing was stored. */
  tickCount: number;
  /** True when at least one figure could be derived. */
  available: boolean;
}

export const EMPTY_RANGED_STATS: RangedNetworkStats = {
  apTotal: null,
  apPeak: null,
  apOnline: null,
  clientTotal: null,
  clientPeak: null,
  clientAuthenticated: null,
  throughputUpload: null,
  throughputDownload: null,
  tickCount: 0,
  available: false,
};

interface TickTotals {
  numerator: number;
  denominator: number;
  value: number;
  /** Whether anything was actually contributed, so an all-null tick is skipped. */
  hasNumerator: boolean;
  hasDenominator: boolean;
  hasValue: boolean;
}

/**
 * Collapse one metric's series into per-timestamp totals.
 *
 * Keyed on the observation instant, so the several site-scoped series that share
 * a collection tick are summed into that tick rather than being averaged
 * against each other.
 */
function totalsByTick(series: MetricSeries[], metricName: string): Map<number, TickTotals> {
  const byTick = new Map<number, TickTotals>();

  for (const entry of series) {
    if (entry.key.metricName !== metricName) continue;

    for (const point of entry.points) {
      const at = new Date(point.observedAt).getTime();
      if (Number.isNaN(at)) continue;

      const tick = byTick.get(at) ?? {
        numerator: 0,
        denominator: 0,
        value: 0,
        hasNumerator: false,
        hasDenominator: false,
        hasValue: false,
      };

      if (point.numerator !== null && Number.isFinite(point.numerator)) {
        tick.numerator += point.numerator;
        tick.hasNumerator = true;
      }
      if (point.denominator !== null && Number.isFinite(point.denominator)) {
        tick.denominator += point.denominator;
        tick.hasDenominator = true;
      }
      if (point.value !== null && Number.isFinite(point.value)) {
        tick.value += point.value;
        tick.hasValue = true;
      }

      byTick.set(at, tick);
    }
  }

  return byTick;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function peak(values: number[]): number | null {
  return values.length === 0 ? null : Math.max(...values);
}

/** Mean of a per-tick sum, rounded to a whole count. */
function meanCount(byTick: Map<number, TickTotals>, field: 'numerator' | 'denominator'): number | null {
  const flag = field === 'numerator' ? 'hasNumerator' : 'hasDenominator';
  const values = [...byTick.values()].filter((tick) => tick[flag]).map((tick) => tick[field]);
  const average = mean(values);
  return average === null ? null : Math.round(average);
}

function peakCount(byTick: Map<number, TickTotals>, field: 'numerator' | 'denominator'): number | null {
  const flag = field === 'numerator' ? 'hasNumerator' : 'hasDenominator';
  return peak([...byTick.values()].filter((tick) => tick[flag]).map((tick) => tick[field]));
}

/** Mean of a per-tick summed gauge, unrounded (bit rates are not counts). */
function meanValue(byTick: Map<number, TickTotals>): number | null {
  return mean([...byTick.values()].filter((tick) => tick.hasValue).map((tick) => tick.value));
}

/**
 * Derive window figures from a `/api/monitoring/history` response.
 *
 * Series for metrics that were never collected are simply absent, and every
 * field is independently nullable — a deployment with `sle` but no `throughput`
 * gets client and AP counts and nulls for the rates, rather than nothing.
 */
export function deriveRangedNetworkStats(series: MetricSeries[]): RangedNetworkStats {
  const apHealth = totalsByTick(series, 'ap_health');
  const connects = totalsByTick(series, 'successful_connects');
  const upload = totalsByTick(series, 'totalUpload');
  const download = totalsByTick(series, 'totalDownload');

  const stats: RangedNetworkStats = {
    apTotal: meanCount(apHealth, 'denominator'),
    apPeak: peakCount(apHealth, 'denominator'),
    apOnline: meanCount(apHealth, 'numerator'),
    clientTotal: meanCount(connects, 'denominator'),
    clientPeak: peakCount(connects, 'denominator'),
    clientAuthenticated: meanCount(connects, 'numerator'),
    throughputUpload: meanValue(upload),
    throughputDownload: meanValue(download),
    tickCount: new Set([...apHealth.keys(), ...connects.keys()]).size,
    available: false,
  };

  stats.available =
    stats.apTotal !== null ||
    stats.clientTotal !== null ||
    stats.throughputUpload !== null ||
    stats.throughputDownload !== null;

  return stats;
}
