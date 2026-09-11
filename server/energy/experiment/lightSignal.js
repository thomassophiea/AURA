/**
 * Darkness / recovery detection for the experiment.
 *
 * The existing light-aware hysteresis (lightState.js) debounces in TENS OF
 * MINUTES, which is right for an always-on optimization policy and useless for
 * a demonstration someone is standing in front of. This module debounces in
 * seconds against the experiment's own configured thresholds, over the same
 * `light_sensor_samples` rows the existing ingest already writes. No second
 * sensor pipeline exists.
 *
 * Units: the AP5020 and AP4020X carry a JSA-1141 ambient-light sensor on I2C
 * 0x38. Its data registers (0x1E/0x1F) return an uncalibrated 16-bit COUNT, not
 * lux. Observed on hardware: a lit lab room reads 6-52, a dark radome reads 2.
 * Calling that "lux" would be fabricated precision, so thresholds are expressed
 * in raw counts throughout and the column name `lux` is retained only because
 * the table predates this finding.
 */

import { query } from '../../db/pool.js';

/**
 * Recent light samples for a set of APs.
 * @returns {Promise<Map<string, Array<{raw:number|null, state:string, observedAt:Date}>>>}
 */
export async function fetchRecentLightSamples({ sourceId, serials, sinceSeconds = 900 }) {
  if (!serials || serials.length === 0) return new Map();
  const { rows } = await query(
    `SELECT ap_serial, lux AS raw, normalized_state, reported_state, observed_at
     FROM light_sensor_samples
     WHERE monitored_source_id = $1
       AND ap_serial = ANY($2::text[])
       AND observed_at >= now() - ($3 * interval '1 second')
     ORDER BY ap_serial, observed_at DESC`,
    [sourceId, serials, sinceSeconds]
  );
  const byAp = new Map();
  for (const r of rows) {
    if (!byAp.has(r.ap_serial)) byAp.set(r.ap_serial, []);
    byAp.get(r.ap_serial).push({
      raw: r.raw == null ? null : Number(r.raw),
      normalizedState: r.normalized_state,
      reportedState: r.reported_state,
      observedAt: r.observed_at,
    });
  }
  return byAp;
}

/**
 * How long one AP has been continuously at or below `threshold`, walking
 * newest-first. A single reading above the threshold ends the run — that is
 * what makes a camera flash or someone opening a door fail to satisfy the
 * persistence requirement instead of ending the experiment early.
 *
 * @param {Array<{raw:number|null, reportedState?:string, observedAt:Date|string}>} samples newest first
 * @returns {{seconds:number, satisfied:boolean, latestRaw:number|null, stale:boolean, sampleCount:number}}
 */
export function darkRunSeconds(samples, { threshold, persistenceSeconds, now = new Date(), staleAfterSeconds = 180 }) {
  const list = samples ?? [];
  if (list.length === 0) {
    return { seconds: 0, satisfied: false, latestRaw: null, stale: true, sampleCount: 0 };
  }

  const newest = list[0];
  const newestAt = new Date(newest.observedAt).getTime();
  const stale = now.getTime() - newestAt > staleAfterSeconds * 1000;

  const isDark = (s) => {
    if (Number.isFinite(s.raw)) return s.raw <= threshold;
    // No numeric reading: fall back to what the agent called it. `unknown`
    // is never treated as dark — loss of signal must not trigger an action.
    return s.reportedState === 'dark';
  };

  if (!isDark(newest)) {
    return { seconds: 0, satisfied: false, latestRaw: newest.raw ?? null, stale, sampleCount: list.length };
  }

  let runStart = newestAt;
  let count = 0;
  for (const s of list) {
    if (!isDark(s)) break;
    runStart = new Date(s.observedAt).getTime();
    count += 1;
  }

  // Measure the run to NOW, not to the newest sample: an AP that went dark and
  // then stopped reporting has not proven continued darkness, which is what
  // `stale` flags — but while it is reporting, elapsed time is real time.
  const seconds = Math.max(0, (now.getTime() - runStart) / 1000);
  return {
    seconds,
    satisfied: !stale && seconds >= persistenceSeconds && count >= 2,
    latestRaw: newest.raw ?? null,
    stale,
    sampleCount: count,
  };
}

/** Mirror of darkRunSeconds for the return to light. */
export function lightRunSeconds(samples, { threshold, persistenceSeconds, now = new Date(), staleAfterSeconds = 180 }) {
  const list = samples ?? [];
  if (list.length === 0) return { seconds: 0, satisfied: false, latestRaw: null, stale: true, sampleCount: 0 };
  const newest = list[0];
  const newestAt = new Date(newest.observedAt).getTime();
  const stale = now.getTime() - newestAt > staleAfterSeconds * 1000;

  const isLit = (s) => (Number.isFinite(s.raw) ? s.raw >= threshold : s.reportedState === 'light');
  if (!isLit(newest)) {
    return { seconds: 0, satisfied: false, latestRaw: newest.raw ?? null, stale, sampleCount: list.length };
  }
  let runStart = newestAt;
  let count = 0;
  for (const s of list) {
    if (!isLit(s)) break;
    runStart = new Date(s.observedAt).getTime();
    count += 1;
  }
  const seconds = Math.max(0, (now.getTime() - runStart) / 1000);
  return { seconds, satisfied: !stale && seconds >= persistenceSeconds && count >= 2, latestRaw: newest.raw ?? null, stale, sampleCount: count };
}

/**
 * Fleet-level verdict for the North side.
 *
 * A single AP is not the room. `quorum` is the fraction of REPORTING North APs
 * that must agree; APs that are not reporting at all are excluded from the
 * denominator rather than counted as lit, and the caller is told how many were
 * excluded so a one-AP-out-of-six "quorum" cannot pass unnoticed.
 */
export function evaluateSide({ samplesByAp, serials, threshold, persistenceSeconds, now, quorum = 0.5, mode = 'dark' }) {
  const fn = mode === 'dark' ? darkRunSeconds : lightRunSeconds;
  const perAp = serials.map((serial) => ({
    serial,
    ...fn(samplesByAp.get(serial), { threshold, persistenceSeconds, now }),
  }));

  const reporting = perAp.filter((a) => !a.stale && a.sampleCount > 0);
  const satisfied = perAp.filter((a) => a.satisfied);
  const ratio = reporting.length > 0 ? satisfied.length / reporting.length : 0;

  return {
    mode,
    perAp,
    reportingCount: reporting.length,
    sensorSilentCount: perAp.length - reporting.length,
    satisfiedCount: satisfied.length,
    quorumRatio: ratio,
    // No reporting sensors at all is NOT a trigger. A dead sensor feed must
    // never look like a dark room.
    triggered: reporting.length > 0 && ratio >= quorum,
  };
}
