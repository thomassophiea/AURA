/**
 * Cumulative counter -> interval delta, with reset handling.
 *
 * The controller reports `/v1/stations` rxBytes/txBytes as totals since
 * association. Charting those directly produces an ever-rising line that looks
 * like traffic growth; subtracting them naively produces a huge negative spike
 * whenever a client reassociates or an AP reboots.
 *
 * So: a backwards-moving counter yields `delta: null` (a real gap), never a
 * negative number and never the raw post-reset reading — the traffic between
 * the last reading and the reset was genuinely not observed, and inventing it
 * would be a fabrication.
 */

/** Beyond this, a single delta spans too long to be attributed to one bucket. */
const DEFAULT_MAX_INTERVAL_SECONDS = 900;

/**
 * @typedef {{ value: number, observedAt: Date }} CounterReading
 * @typedef {{ delta: number|null, intervalSeconds: number,
 *             qualityState: 'observed'|'counter_reset'|'partial',
 *             observedAt: Date, previousObservedAt: Date }} CounterDelta
 */

/**
 * @param {CounterReading|null} previous
 * @param {CounterReading} current
 * @param {{ maxIntervalSeconds?: number }} [options]
 * @returns {CounterDelta|null} null when no interval can be formed at all.
 */
export function computeCounterDelta(previous, current, options = {}) {
  const { maxIntervalSeconds = DEFAULT_MAX_INTERVAL_SECONDS } = options;

  if (!previous || !current) return null;
  if (!Number.isFinite(previous.value) || !Number.isFinite(current.value)) return null;

  const intervalMs = current.observedAt.getTime() - previous.observedAt.getTime();
  // Zero or negative interval: not an interval. Emitting anything here would
  // either divide by zero downstream or reorder history.
  if (!(intervalMs > 0)) return null;

  const intervalSeconds = intervalMs / 1000;
  const base = {
    intervalSeconds,
    observedAt: current.observedAt,
    previousObservedAt: previous.observedAt,
  };

  if (current.value < previous.value) {
    return { ...base, delta: null, qualityState: 'counter_reset' };
  }

  return {
    ...base,
    delta: current.value - previous.value,
    qualityState: intervalSeconds > maxIntervalSeconds ? 'partial' : 'observed',
  };
}

/**
 * Difference a whole series of readings.
 *
 * @param {CounterReading[]} readings
 * @param {{ maxIntervalSeconds?: number }} [options]
 * @returns {CounterDelta[]}
 */
export function computeCounterDeltaSeries(readings, options = {}) {
  if (!Array.isArray(readings) || readings.length < 2) return [];

  const ordered = [...readings].sort(
    (a, b) => a.observedAt.getTime() - b.observedAt.getTime()
  );

  const deltas = [];
  for (let i = 1; i < ordered.length; i += 1) {
    const delta = computeCounterDelta(ordered[i - 1], ordered[i], options);
    if (delta) deltas.push(delta);
  }
  return deltas;
}
