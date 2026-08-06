/**
 * Metric kind registry.
 *
 * The single place where the *semantics* of a metric are declared. Getting this
 * wrong produces charts that look fine and are wrong: summed percentages,
 * cumulative byte counters presented as per-interval traffic, averaged ratios.
 *
 * Kinds:
 *   gauge         instantaneous value; averaging over time is meaningful
 *   percentage    0-100; NEVER summed, and only averaged when weighted by its
 *                 denominator (which is why SLE samples carry num/den)
 *   ratio         numerator/denominator pair; re-aggregate from the parts
 *   counter       monotonic cumulative total as reported by the source
 *   counter_delta interval value derived from consecutive counter readings
 *   event_count   count of discrete events within a bucket; summable
 */

/** @typedef {'gauge'|'percentage'|'ratio'|'counter'|'counter_delta'|'event_count'} MetricKind */

/**
 * Unit -> kind, used when a metric name is not explicitly registered.
 * Deliberately conservative: an unknown unit becomes a gauge, which is the only
 * kind that is safe to display without further interpretation.
 */
const UNIT_KINDS = {
  '%': 'percentage',
  percent: 'percentage',
  bps: 'gauge',
  Mbps: 'gauge',
  dBm: 'gauge',
  dB: 'gauge',
  mW: 'gauge',
  W: 'gauge',
  users: 'gauge',
  clients: 'gauge',
  ms: 'gauge',
  seconds: 'gauge',
  count: 'event_count',
};

/**
 * Explicit overrides keyed by `${metricFamily}:${metricName}` (lowercased), or
 * by metric name alone as a fallback. Only metrics whose kind is not implied by
 * their unit need an entry.
 */
const EXPLICIT_KINDS = {
  // /v1/stations counters — cumulative since association, reset on reconnect.
  'station:rxbytes': 'counter',
  'station:txbytes': 'counter',
  'station:rxpackets': 'counter',
  'station:txpackets': 'counter',
  // Computed SLE scores are success percentages backed by entity counts.
  // Keys must match the metric names emitted by sleNormalizer exactly.
  'sle:coverage': 'percentage',
  'sle:throughput': 'percentage',
  'sle:capacity': 'percentage',
  'sle:successful_connects': 'percentage',
  'sle:time_to_connect': 'percentage',
  'sle:roaming': 'percentage',
  'sle:ap_health': 'percentage',
};

/**
 * Metric families this collector persists. Kept explicit so a controller
 * suddenly returning a new report block does not silently widen the schema.
 */
export const METRIC_FAMILIES = Object.freeze({
  AP_REPORT: 'ap_report',
  SITE_REPORT: 'site_report',
  SLE: 'sle',
  INVENTORY: 'inventory',
  STATION: 'station',
  THROUGHPUT: 'throughput',
});

/**
 * Classify a metric.
 *
 * @param {{ family?: string, name: string, unit?: string|null }} metric
 * @returns {MetricKind}
 */
export function classifyMetric({ family, name, unit } = {}) {
  const key = `${(family ?? '').toLowerCase()}:${(name ?? '').toLowerCase()}`;
  if (EXPLICIT_KINDS[key]) return EXPLICIT_KINDS[key];

  const bareName = (name ?? '').toLowerCase();
  const bareMatch = Object.entries(EXPLICIT_KINDS).find(([k]) => k.endsWith(`:${bareName}`));
  if (bareMatch) return bareMatch[1];

  if (unit && UNIT_KINDS[unit]) return UNIT_KINDS[unit];
  return 'gauge';
}

/** True when this kind must never be summed across series or time buckets. */
export function isNonSummable(kind) {
  return kind === 'percentage' || kind === 'ratio' || kind === 'gauge' || kind === 'counter';
}

/**
 * True when the stored value is a raw cumulative reading and callers must use
 * the derived `counter_delta` series for interval questions.
 */
export function isCumulative(kind) {
  return kind === 'counter';
}
