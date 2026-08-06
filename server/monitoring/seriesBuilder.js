/**
 * Turns flat sample rows into chart-ready series with explicit gaps.
 *
 * The gap logic is the point of this module. A period with no observation must
 * reach the UI as an absence, not as a zero and not as a straight line between
 * the surrounding points — a chart that interpolates across a two-day gateway
 * outage tells the operator the network was fine.
 */

/**
 * Freshness of a value, given when it was observed and when we last heard from
 * the source at all.
 *
 * @returns {'fresh'|'stale'|'offline'|'unknown'}
 */
export function classifyFreshness({ observedAt, lastSuccessAt, consecutiveFailures, now, staleAfterSeconds }) {
  if (!observedAt) return 'unknown';

  const ageSeconds = (now.getTime() - new Date(observedAt).getTime()) / 1000;
  const sourceIsFailing = (consecutiveFailures ?? 0) > 0;
  const contactAgeSeconds = lastSuccessAt
    ? (now.getTime() - new Date(lastSuccessAt).getTime()) / 1000
    : Infinity;

  // Failing source with no recent contact: the data is stored history, and the
  // UI must not call it live.
  if (sourceIsFailing && contactAgeSeconds > staleAfterSeconds) return 'offline';
  if (ageSeconds > staleAfterSeconds) return 'stale';
  return 'fresh';
}

/** Stable identity for a series across points. */
function seriesKey(point) {
  return JSON.stringify([
    point.monitoredSourceId,
    point.siteId ?? null,
    point.deviceExternalId ?? null,
    point.radioExternalId ?? null,
    point.wlanExternalId ?? null,
    point.metricFamily,
    point.metricName,
    point.dimensions ?? {},
  ]);
}

/**
 * Detect gaps in an ordered point list.
 *
 * `expectedIntervalSeconds` is the cadence we believe the series has; a jump of
 * more than `gapFactor` times that is reported as a gap. Without an expected
 * interval, the median observed spacing is used, which adapts to whatever
 * resolution the controller actually returned.
 */
export function detectGaps(points, { expectedIntervalSeconds = null, gapFactor = 2.5 } = {}) {
  if (!Array.isArray(points) || points.length < 2) return [];

  const times = points.map((p) => new Date(p.observedAt).getTime()).sort((a, b) => a - b);

  let interval = expectedIntervalSeconds ? expectedIntervalSeconds * 1000 : null;
  if (!interval) {
    const deltas = [];
    for (let i = 1; i < times.length; i += 1) deltas.push(times[i] - times[i - 1]);
    deltas.sort((a, b) => a - b);
    // 25th percentile, not the median: after a long outage more than half the
    // intervals can be gaps, and a median would then treat the outage itself as
    // the normal cadence and report no gap at all.
    interval = deltas[Math.floor(deltas.length * 0.25)];
  }
  if (!interval || !Number.isFinite(interval) || interval <= 0) return [];

  const threshold = interval * gapFactor;
  const gaps = [];
  for (let i = 1; i < times.length; i += 1) {
    const delta = times[i] - times[i - 1];
    if (delta > threshold) {
      gaps.push({
        from: new Date(times[i - 1]).toISOString(),
        to: new Date(times[i]).toISOString(),
        durationSeconds: Math.round(delta / 1000),
      });
    }
  }
  return gaps;
}

/**
 * Group points into series and attach gap metadata.
 *
 * @returns {Array<{ key: object, unit: string|null, metricKind: string,
 *                   points: object[], gaps: object[] }>}
 */
export function buildSeries(points, { expectedIntervalSeconds = null } = {}) {
  const grouped = new Map();

  for (const point of points ?? []) {
    const key = seriesKey(point);
    if (!grouped.has(key)) {
      grouped.set(key, {
        key: {
          monitoredSourceId: point.monitoredSourceId,
          siteId: point.siteId ?? null,
          deviceExternalId: point.deviceExternalId ?? null,
          radioExternalId: point.radioExternalId ?? null,
          wlanExternalId: point.wlanExternalId ?? null,
          metricFamily: point.metricFamily,
          metricName: point.metricName,
          dimensions: point.dimensions ?? {},
        },
        unit: point.unit ?? null,
        metricKind: point.metricKind ?? 'gauge',
        points: [],
      });
    }
    const series = grouped.get(key);
    series.points.push({
      observedAt: new Date(point.observedAt).toISOString(),
      value: point.numericValue,
      numerator: point.numerator ?? null,
      denominator: point.denominator ?? null,
      sampleCount: point.sampleCount ?? null,
      qualityState: point.qualityState ?? 'observed',
    });
  }

  return [...grouped.values()].map((series) => {
    series.points.sort((a, b) => a.observedAt.localeCompare(b.observedAt));
    return {
      ...series,
      gaps: detectGaps(
        series.points.map((p) => ({ observedAt: p.observedAt })),
        { expectedIntervalSeconds }
      ),
    };
  });
}

/**
 * Weighted aggregate of a percentage series.
 *
 * Averaging stored percentages would weight a 3-client site the same as a
 * 300-client one; recomputing from numerator/denominator does not. Returns null
 * when the parts were never stored, rather than falling back to a wrong number.
 */
export function aggregatePercentage(points) {
  let numerator = 0;
  let denominator = 0;
  let usable = 0;

  for (const point of points ?? []) {
    if (Number.isFinite(point.numerator) && Number.isFinite(point.denominator)) {
      numerator += point.numerator;
      denominator += point.denominator;
      usable += 1;
    }
  }

  if (usable === 0 || denominator === 0) return null;
  return {
    value: parseFloat(((numerator / denominator) * 100).toFixed(1)),
    numerator,
    denominator,
    pointsUsed: usable,
  };
}
