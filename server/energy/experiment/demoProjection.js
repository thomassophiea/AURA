/**
 * The demo fail-safe projection model.
 *
 * WHY THIS EXISTS
 * ---------------
 * The real POC path is: ambient-light sensor → trigger → controller write →
 * read-back verification → measured `pwrUsage` telemetry → difference-in-
 * differences. Every number on the Energy page comes from the far end of that
 * chain, which is exactly right and exactly why it is fragile in a room full of
 * customers: a dead I2C sensor, an AP that will not take the write, a controller
 * that stops answering, or a collector gap anywhere in the middle and there is
 * nothing to show.
 *
 * This module is the fallback. It projects what the treatment site WOULD be
 * drawing, from that site's own real recent telemetry, so the demonstration
 * survives a failure in any dependency outside AURA.
 *
 * WHAT IT IS NOT
 * --------------
 * It is not telemetry. Nothing here is written to `metric_samples`, sent to the
 * controller, or mixed into a stored experiment result. It is computed per
 * request, laid over the response, and every value it produces is stamped
 * `DEMO_SIMULATED`. The control side is never projected on the basis of the
 * override — the control is the baseline of the whole story and stays real.
 *
 * HOW IT STAYS BELIEVABLE
 * -----------------------
 * 1. The starting point is the treatment site's **measured** watts per AP, not
 *    a constant. If an AP5022 is actually drawing 14.85 W, that is where its
 *    curve starts.
 * 2. The reduction is the **measured** one: disabling the 6 GHz radio on an
 *    AP5020 moved it 14.112 W → 11.868 W, i.e. 15.9%. `powerModel.js` models
 *    that band at 25%; the measurement is what this uses, because a demo that
 *    overstates the saving is worse than no demo.
 * 3. Power does not step. The PoE wattmeter takes tens of seconds to settle, so
 *    the curve eases in over `SETTLE_SECONDS` and the chart bends rather than
 *    cliff-edges.
 * 4. Real APs wobble. A control AP held 14.30–14.47 W over two minutes — about
 *    ±0.6%. Jitter of that order is applied, seeded per AP and per sample
 *    bucket, so the value is stable when the same instant is polled twice but
 *    is not a perfectly flat line.
 * 5. Per-AP variation in the share (±15% relative, seeded by serial) so four
 *    APs do not all drop by the identical amount, which nothing real ever does.
 * 6. The share is hard-clamped to `MAX_PLAUSIBLE_SHARE`. No configuration or
 *    arithmetic slip can make this claim an impossible saving.
 *
 * The rows it emits are shaped for `analysis.summarizeSide`, so the projection
 * is fed through the SAME `summarizeSide` → `attribute` → `projectSavings`
 * chain as real telemetry. The demo cannot be mathematically inconsistent with
 * the real feature, because it is not a second implementation of it.
 */

/**
 * Measured fraction of an AP5020/AP5022's total draw attributable to its 6 GHz
 * radio, from the controlled measurement on 2026-09-11:
 * 14.112 W → 11.868 W with radio 3 disabled and verified off-air.
 */
export const MEASURED_RADIO_DISABLE_SHARE = 0.159;

/** How long the PoE wattmeter takes to settle after a radio state change. */
export const SETTLE_SECONDS = 45;

/**
 * Nothing this module produces may claim more than this. The measured figure is
 * 0.159 and the most optimistic model in the codebase says 0.25; a projection
 * above that is a bug, not a better result.
 */
export const MAX_PLAUSIBLE_SHARE = 0.25;

/** Mimics the collector's cadence so projected points look sampled, not drawn. */
export const SAMPLE_BUCKET_SECONDS = 60;

/** Relative wobble applied to each projected reading (±0.6%, as measured). */
const JITTER_RELATIVE = 0.006;

/** Relative spread of the per-AP share around the measured mean (±15%). */
const SHARE_SPREAD = 0.15;

/** The one value-provenance label every projected number carries. */
export const DEMO_SOURCE = 'DEMO_SIMULATED';

/**
 * Deterministic unit noise in [-1, 1] from an arbitrary string.
 *
 * Deterministic on purpose: two polls of the same instant must agree, or the
 * chart jitters under the cursor and the AP table disagrees with the tile above
 * it. FNV-1a, then mapped — this is decoration, not cryptography.
 */
export function jitterUnit(seed) {
  let hash = 0x811c9dc5;
  const text = String(seed);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash / 0xffffffff) * 2 - 1;
}

/**
 * The share of its draw one AP gives up, with stable per-AP variation.
 * Clamped into [0, MAX_PLAUSIBLE_SHARE] so no input can produce a claim the
 * hardware could not support.
 */
export function apShare(serial, baseShare = MEASURED_RADIO_DISABLE_SHARE) {
  const base = Number.isFinite(baseShare) ? baseShare : MEASURED_RADIO_DISABLE_SHARE;
  const varied = base * (1 + SHARE_SPREAD * jitterUnit(`share:${serial}`));
  return Math.min(MAX_PLAUSIBLE_SHARE, Math.max(0, varied));
}

/**
 * Eased 0→1 progress through the settle window.
 *
 * smoothstep rather than linear: a linear ramp has a visible corner at both
 * ends and reads as drawn. Real power curves do not have corners.
 */
export function rampProgress(elapsedSeconds, settleSeconds = SETTLE_SECONDS) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return 0;
  if (!Number.isFinite(settleSeconds) || settleSeconds <= 0) return 1;
  const t = Math.min(1, elapsedSeconds / settleSeconds);
  return t * t * (3 - 2 * t);
}

/**
 * The share actually in effect at a given moment.
 *
 * `lights_off` ramps 0 → target. `lights_on` ramps whatever share had been
 * reached back down to 0, which is why the caller carries `fromShare` across a
 * mode change: without it, toggling off → on → off would recover from zero and
 * the curve would jump.
 */
export function shareAt({
  mode,
  elapsedSeconds,
  targetShare,
  fromShare = 0,
  settleSeconds = SETTLE_SECONDS,
}) {
  const progress = rampProgress(elapsedSeconds, settleSeconds);
  if (mode === 'lights_off') {
    return fromShare + (targetShare - fromShare) * progress;
  }
  if (mode === 'lights_on') {
    return fromShare * (1 - progress);
  }
  return 0;
}

/** The bucket index an instant falls in — the unit of jitter stability. */
function bucketOf(epochSeconds, bucketSeconds = SAMPLE_BUCKET_SECONDS) {
  return Math.floor(epochSeconds / bucketSeconds);
}

/**
 * One AP's projected instantaneous draw at one instant.
 *
 * @param {object} args
 * @param {string} args.apSerial
 * @param {number} args.baselineWatts measured, from this AP's own telemetry
 * @param {'lights_off'|'lights_on'} args.mode
 * @param {number} args.elapsedSeconds since the mode began
 * @param {number} args.atEpochSeconds the instant, for jitter stability
 * @returns {number|null} watts, or null when there is no real baseline to build on
 */
export function projectApWatts({
  apSerial,
  baselineWatts,
  mode,
  elapsedSeconds,
  atEpochSeconds,
  fromShare = 0,
  baseShare = MEASURED_RADIO_DISABLE_SHARE,
  settleSeconds = SETTLE_SECONDS,
}) {
  // No measured baseline means no projection. A fabricated starting point is
  // how a demo ends up quoting a number that has nothing behind it at all.
  if (!Number.isFinite(baselineWatts) || baselineWatts <= 0) return null;

  const share = shareAt({
    mode,
    elapsedSeconds,
    targetShare: apShare(apSerial, baseShare),
    fromShare,
    settleSeconds,
  });
  const wobble = 1 + JITTER_RELATIVE * jitterUnit(`${apSerial}:${bucketOf(atEpochSeconds)}`);
  const watts = baselineWatts * (1 - share) * wobble;
  return Math.max(0, Number(watts.toFixed(3)));
}

/**
 * Project the treatment side over a window, as rows `summarizeSide` accepts.
 *
 * `avgWatts` is the time-average across the window rather than the latest
 * reading, because that is what `summarizeSide` means by it and what the
 * savings integral needs. The average is taken by walking the window one
 * collector bucket at a time — the same way a real average over real samples
 * would be formed.
 *
 * @param {object} args
 * @param {Array<{apSerial:string, model:string|null, baselineWatts:number|null}>} args.baselineAps
 *        one entry per treatment AP, `baselineWatts` MEASURED
 * @param {'lights_off'|'lights_on'} args.mode
 * @param {Date|string} args.startedAt when this mode began
 * @param {Date} args.now
 * @returns {{rows: object[], elapsedSeconds: number, shareNow: number|null, apCountProjected: number}}
 */
export function projectTreatmentRows({
  baselineAps = [],
  mode,
  startedAt,
  now = new Date(),
  fromShare = 0,
  baseShare = MEASURED_RADIO_DISABLE_SHARE,
  settleSeconds = SETTLE_SECONDS,
}) {
  const startMs = new Date(startedAt).getTime();
  const nowMs = now.getTime();
  const elapsedSeconds = Number.isFinite(startMs) ? Math.max(0, (nowMs - startMs) / 1000) : 0;

  const rows = [];
  let shareSum = 0;
  let shareCount = 0;

  for (const ap of baselineAps) {
    if (!Number.isFinite(ap?.baselineWatts) || ap.baselineWatts <= 0) continue;

    // Walk the window in collector-sized steps and average, so a 4-minute
    // window that spent 45 s ramping is not credited with the settled figure
    // for its whole length.
    const steps = Math.max(1, Math.ceil(elapsedSeconds / SAMPLE_BUCKET_SECONDS));
    let wattSum = 0;
    let counted = 0;
    for (let i = 0; i < steps; i += 1) {
      const atSeconds = Math.min(elapsedSeconds, (i + 0.5) * SAMPLE_BUCKET_SECONDS);
      const watts = projectApWatts({
        apSerial: ap.apSerial,
        baselineWatts: ap.baselineWatts,
        mode,
        elapsedSeconds: atSeconds,
        atEpochSeconds: (startMs + atSeconds * 1000) / 1000,
        fromShare,
        baseShare,
        settleSeconds,
      });
      if (watts == null) continue;
      wattSum += watts;
      counted += 1;
    }
    if (counted === 0) continue;

    const avgWatts = wattSum / counted;
    const observedSeconds = Math.max(SAMPLE_BUCKET_SECONDS, elapsedSeconds);
    rows.push({
      apSerial: ap.apSerial,
      model: ap.model ?? null,
      avgWatts: Number(avgWatts.toFixed(3)),
      kwh: Number(((avgWatts * observedSeconds) / 3_600_000).toFixed(6)),
      observedSeconds,
      sampleCount: counted,
      // Carried per row so no consumer can lose track of what it is holding.
      valueSource: DEMO_SOURCE,
    });

    shareSum += shareAt({
      mode,
      elapsedSeconds,
      targetShare: apShare(ap.apSerial, baseShare),
      fromShare,
      settleSeconds,
    });
    shareCount += 1;
  }

  return {
    rows,
    elapsedSeconds,
    shareNow: shareCount > 0 ? shareSum / shareCount : null,
    apCountProjected: rows.length,
  };
}

/**
 * Project the per-AP instantaneous view the AP table renders.
 *
 * @returns {Map<string, {watts:number|null, observedAt:string, valueSource:string}>}
 */
export function projectApInstant({
  baselineAps = [],
  mode,
  startedAt,
  now = new Date(),
  fromShare = 0,
  baseShare = MEASURED_RADIO_DISABLE_SHARE,
  settleSeconds = SETTLE_SECONDS,
}) {
  const startMs = new Date(startedAt).getTime();
  const elapsedSeconds = Number.isFinite(startMs)
    ? Math.max(0, (now.getTime() - startMs) / 1000)
    : 0;
  const out = new Map();
  for (const ap of baselineAps) {
    const watts = projectApWatts({
      apSerial: ap.apSerial,
      baselineWatts: ap.baselineWatts,
      mode,
      elapsedSeconds,
      atEpochSeconds: now.getTime() / 1000,
      fromShare,
      baseShare,
      settleSeconds,
    });
    if (watts == null) continue;
    out.set(ap.apSerial, {
      watts,
      observedAt: now.toISOString(),
      valueSource: DEMO_SOURCE,
    });
  }
  return out;
}

/**
 * Projected chart points for the treatment site, from the moment the override
 * began up to now.
 *
 * Only the treatment site, and only from the override's start: the history
 * before it is real, and overwriting real history with a projection is the one
 * thing this feature must never do. The returned points are stamped so the
 * chart can draw them differently from the measured ones either side.
 *
 * @returns {Array<{siteId:string, bucketStart:string, siteWatts:number|null,
 *                  wattsPerAp:number|null, apCount:number, valueSource:string}>}
 */
export function projectSeriesPoints({
  siteId,
  baselineAps = [],
  mode,
  startedAt,
  now = new Date(),
  bucketSeconds = SAMPLE_BUCKET_SECONDS,
  fromShare = 0,
  baseShare = MEASURED_RADIO_DISABLE_SHARE,
  settleSeconds = SETTLE_SECONDS,
}) {
  const startMs = new Date(startedAt).getTime();
  const nowMs = now.getTime();
  if (!Number.isFinite(startMs) || nowMs <= startMs) return [];

  const usable = baselineAps.filter(
    (a) => Number.isFinite(a?.baselineWatts) && a.baselineWatts > 0
  );
  if (usable.length === 0) return [];

  const step = Math.max(30, bucketSeconds) * 1000;
  const points = [];
  // Align to the bucket grid so projected points land on the same x-positions
  // the measured series uses; a half-bucket offset reads as two datasets.
  const firstBucket = Math.floor(startMs / step) * step;

  for (let t = firstBucket; t <= nowMs; t += step) {
    const elapsedSeconds = Math.max(0, (t - startMs) / 1000);
    let sum = 0;
    let counted = 0;
    for (const ap of usable) {
      const watts = projectApWatts({
        apSerial: ap.apSerial,
        baselineWatts: ap.baselineWatts,
        mode,
        elapsedSeconds,
        atEpochSeconds: t / 1000,
        fromShare,
        baseShare,
        settleSeconds,
      });
      if (watts == null) continue;
      sum += watts;
      counted += 1;
    }
    if (counted === 0) continue;
    const perAp = sum / counted;
    points.push({
      siteId,
      bucketStart: new Date(t).toISOString(),
      siteWatts: Number(sum.toFixed(3)),
      wattsPerAp: Number(perAp.toFixed(3)),
      apCount: counted,
      valueSource: DEMO_SOURCE,
    });
  }
  return points;
}
