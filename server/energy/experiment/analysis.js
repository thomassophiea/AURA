/**
 * Pure analysis for the North-vs-South experiment: baseline selection,
 * normalization, and attribution.
 *
 * No I/O, no dates-from-now, no rounding for presentation. Every function
 * returns `null` rather than a number it cannot defend, because the one thing
 * this feature must never do is invent a saving.
 *
 * Three numbers get computed, and they are deliberately kept distinct:
 *
 *   withinNorth   North during treatment vs North's own matched baseline.
 *                 Simple, but confounded by anything that changed for both
 *                 sites (a quiet evening, a building emptying out).
 *   crossSite     North vs South during treatment. Removes time-of-day, but
 *                 assumes the two sites were comparable to begin with.
 *   attributed    Difference-in-differences: North's change relative to South's
 *                 change over the same period. This is the number the UI leads
 *                 with, and it is only offered when the pre-period shows the
 *                 two sites actually tracked each other.
 */

const MS_PER_HOUR = 3_600_000;

/** Candidate baseline windows, longest first — the longest one with data wins. */
export const BASELINE_WINDOWS = Object.freeze([
  { key: '7d', days: 7, label: 'Previous 7-day average' },
  { key: '3d', days: 3, label: 'Previous 3-day average' },
  { key: '24h', days: 1, label: 'Previous 24-hour average' },
]);

function finite(n) {
  return Number.isFinite(n) ? n : null;
}

function safeDiv(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  const out = a / b;
  return Number.isFinite(out) ? out : null;
}

/**
 * The strongest baseline window both sides can actually support.
 *
 * `coverage` is per-site `{ earliest, latest }`. History is never extrapolated:
 * if only nine hours exist, the answer says nine hours, it does not pretend to
 * three days.
 */
export function selectBaselineWindow({ coverage, treatmentStart, now = new Date() }) {
  const anchor = treatmentStart ? new Date(treatmentStart) : now;
  const earliests = Object.values(coverage ?? {})
    .map((c) => (c?.earliest ? new Date(c.earliest).getTime() : null))
    .filter((t) => Number.isFinite(t));

  if (earliests.length === 0) {
    return { key: null, label: 'No history', availableHours: 0, sufficient: false, start: null, end: null };
  }

  // The weakest side governs. A 7-day North and a 2-hour South is a 2-hour
  // comparison, not a 7-day one.
  const commonEarliest = Math.max(...earliests);
  const availableHours = Math.max(0, (anchor.getTime() - commonEarliest) / MS_PER_HOUR);

  for (const w of BASELINE_WINDOWS) {
    if (availableHours >= w.days * 24) {
      return {
        key: w.key,
        label: w.label,
        availableHours,
        sufficient: true,
        start: new Date(anchor.getTime() - w.days * 24 * MS_PER_HOUR).toISOString(),
        end: anchor.toISOString(),
      };
    }
  }

  return {
    key: 'partial',
    label: `Historical baseline limited: ${availableHours.toFixed(1)} hours available`,
    availableHours,
    sufficient: false,
    start: new Date(commonEarliest).toISOString(),
    end: anchor.toISOString(),
  };
}

/**
 * Hour-of-day windows matching the treatment period, on each of the preceding
 * `days` days. Wireless draw is diurnal; comparing an 8pm treatment against a
 * 24-hour mean would credit the energy action with the evening lull.
 *
 * Returns UTC ISO ranges. The site timezone matters for labelling, not for
 * matching — the same absolute hours are compared on each day.
 */
export function matchedTimeWindows({ treatmentStart, treatmentEnd, days, now = new Date() }) {
  const start = new Date(treatmentStart);
  const end = new Date(treatmentEnd ?? now);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return [];
  const windows = [];
  for (let d = 1; d <= days; d += 1) {
    const offset = d * 24 * MS_PER_HOUR;
    windows.push({
      start: new Date(start.getTime() - offset).toISOString(),
      end: new Date(end.getTime() - offset).toISOString(),
      daysBack: d,
    });
  }
  return windows;
}

/**
 * Collapse per-AP rows into a side summary.
 *
 * Per-AP normalization is not optional: North and South rarely have the same
 * AP count, and a raw site total would make the smaller site look more
 * efficient for a reason that has nothing to do with the energy action.
 */
export function summarizeSide(apRows, { minObservedSeconds = 60 } = {}) {
  const usable = (apRows ?? []).filter(
    (r) => Number.isFinite(r.avgWatts) && Number(r.observedSeconds) >= minObservedSeconds
  );
  const apCount = usable.length;
  if (apCount === 0) {
    return {
      apCount: 0,
      apCountWithData: 0,
      apCountEnrolled: (apRows ?? []).length,
      wattsPerAp: null,
      siteWatts: null,
      kwh: null,
      observedSeconds: 0,
      perAp: [],
    };
  }
  const totalObserved = usable.reduce((s, r) => s + Number(r.observedSeconds || 0), 0);
  // Weight by observed time so an AP that only reported for two minutes cannot
  // move the mean as much as one that reported for two hours.
  const weightedWatts =
    usable.reduce((s, r) => s + r.avgWatts * Number(r.observedSeconds || 0), 0) / (totalObserved || 1);
  return {
    apCount,
    apCountWithData: apCount,
    apCountEnrolled: (apRows ?? []).length,
    wattsPerAp: finite(weightedWatts),
    siteWatts: finite(weightedWatts * apCount),
    kwh: finite(usable.reduce((s, r) => s + Number(r.kwh || 0), 0)),
    observedSeconds: totalObserved,
    perAp: usable.map((r) => ({
      apSerial: r.apSerial,
      model: r.model ?? null,
      avgWatts: finite(r.avgWatts),
      kwh: finite(Number(r.kwh)),
      observedSeconds: Number(r.observedSeconds || 0),
      sampleCount: Number(r.sampleCount || 0),
    })),
  };
}

/**
 * Were the two sites comparable before the treatment?
 *
 * Reported as a ratio and a plain verdict rather than a p-value: with six APs
 * and one experiment there is no honest significance test to run, and a fake
 * one would be worse than none.
 */
export function assessComparability({ northBaseline, southBaseline }) {
  const ratio = safeDiv(northBaseline?.wattsPerAp, southBaseline?.wattsPerAp);
  if (ratio == null) {
    return { ratio: null, verdict: 'unknown', note: 'One side has no baseline data.' };
  }
  const drift = Math.abs(ratio - 1);
  const verdict = drift <= 0.05 ? 'comparable' : drift <= 0.15 ? 'similar' : 'divergent';
  return {
    ratio,
    verdict,
    note:
      verdict === 'comparable'
        ? 'North and South drew within 5% of each other per AP before the treatment.'
        : verdict === 'similar'
          ? `North drew ${((ratio - 1) * 100).toFixed(1)}% ${ratio > 1 ? 'more' : 'less'} per AP than South before the treatment; the ratio is carried into the attribution.`
          : `North and South differed by ${((ratio - 1) * 100).toFixed(1)}% per AP before the treatment. Cross-site comparison is weak; the within-North change is the more defensible figure.`,
  };
}

/**
 * The core attribution.
 *
 * @returns {{
 *   withinNorth: {deltaWattsPerAp:number|null, percent:number|null},
 *   crossSite:   {deltaWattsPerAp:number|null, percent:number|null},
 *   attributed:  {deltaWattsPerAp:number|null, percent:number|null,
 *                 siteWatts:number|null, method:string, usable:boolean},
 *   comparability: object
 * }}
 */
export function attribute({ northBaseline, northTreatment, southBaseline, southTreatment }) {
  const nb = northBaseline?.wattsPerAp ?? null;
  const nt = northTreatment?.wattsPerAp ?? null;
  const sb = southBaseline?.wattsPerAp ?? null;
  const st = southTreatment?.wattsPerAp ?? null;

  const withinDelta = nb != null && nt != null ? nb - nt : null;
  const withinPct = withinDelta != null ? safeDiv(withinDelta * 100, nb) : null;

  const crossDelta = st != null && nt != null ? st - nt : null;
  const crossPct = crossDelta != null ? safeDiv(crossDelta * 100, st) : null;

  const comparability = assessComparability({ northBaseline, southBaseline });

  // Ratio difference-in-differences. South's own drift over the same clock time
  // is the counterfactual: whatever moved South would have moved North too.
  const southDrift = safeDiv(st, sb);
  let attributedDelta = null;
  let attributedPct = null;
  let method = 'unavailable';
  let usable = false;

  if (nb != null && nt != null && southDrift != null && southDrift > 0) {
    const expectedNorth = nb * southDrift;
    attributedDelta = expectedNorth - nt;
    attributedPct = safeDiv(attributedDelta * 100, expectedNorth);
    method = 'difference-in-differences (South drift as counterfactual)';
    usable = comparability.verdict !== 'unknown';
  } else if (withinDelta != null) {
    attributedDelta = withinDelta;
    attributedPct = withinPct;
    method = 'within-North only (no usable control drift)';
    usable = true;
  }

  const apCount = northTreatment?.apCount ?? 0;
  return {
    withinNorth: { deltaWattsPerAp: finite(withinDelta), percent: finite(withinPct) },
    crossSite: { deltaWattsPerAp: finite(crossDelta), percent: finite(crossPct) },
    attributed: {
      deltaWattsPerAp: finite(attributedDelta),
      percent: finite(attributedPct),
      siteWatts: attributedDelta != null ? finite(attributedDelta * apCount) : null,
      method,
      usable,
    },
    comparability,
  };
}

/**
 * Money, carbon, and projections from an observed watt saving.
 *
 * Delegates every unit conversion to the existing energyCalculator so this
 * feature cannot drift away from the rest of the Energy page's arithmetic.
 */
export function projectSavings({
  attributedSiteWatts,
  elapsedSeconds,
  ratePerKwh,
  emissionsFactorKgPerKwh,
  calc,
}) {
  if (!Number.isFinite(attributedSiteWatts) || attributedSiteWatts <= 0) {
    return {
      observedWh: null, observedKwh: null, dailyKwh: null, monthlyKwh: null, annualKwh: null,
      cost: null, annualCost: null, co2eKg: null, annualCo2eKg: null,
    };
  }
  const observedKwh = calc.kwhFromWattSeconds(attributedSiteWatts, elapsedSeconds);
  const dailyKwh = calc.projectDaily(observedKwh, elapsedSeconds);
  const monthlyKwh = calc.projectMonthly(dailyKwh);
  const annualKwh = calc.projectAnnual(dailyKwh);
  return {
    observedWh: observedKwh == null ? null : observedKwh * 1000,
    observedKwh,
    dailyKwh,
    monthlyKwh,
    annualKwh,
    cost: calc.estimateCost(observedKwh, ratePerKwh),
    annualCost: calc.estimateCost(annualKwh, ratePerKwh),
    co2eKg:
      observedKwh != null && Number.isFinite(emissionsFactorKgPerKwh)
        ? observedKwh * emissionsFactorKgPerKwh
        : null,
    annualCo2eKg:
      annualKwh != null && Number.isFinite(emissionsFactorKgPerKwh)
        ? annualKwh * emissionsFactorKgPerKwh
        : null,
  };
}

/**
 * Telemetry quality for the window actually analysed. Drives the "Data
 * Quality" chip and, more importantly, whether a savings claim is offered at
 * all.
 */
export function assessQuality({ north, south, windowSeconds, expectedSampleIntervalSeconds = 60 }) {
  function sideQuality(side) {
    const expected = windowSeconds > 0 ? windowSeconds : null;
    const worst = side.perAp.length
      ? Math.min(...side.perAp.map((a) => a.observedSeconds))
      : 0;
    return {
      apCountEnrolled: side.apCountEnrolled,
      apCountReporting: side.apCountWithData,
      coveragePercent: expected ? Math.min(100, (worst / expected) * 100) : null,
      missingAps: side.apCountEnrolled - side.apCountWithData,
    };
  }
  const n = sideQuality(north);
  const s = sideQuality(south);
  const worstCoverage = Math.min(n.coveragePercent ?? 0, s.coveragePercent ?? 0);
  const anyMissing = n.missingAps > 0 || s.missingAps > 0;
  const enoughSamples =
    windowSeconds >= expectedSampleIntervalSeconds * 3 && north.apCountWithData > 0 && south.apCountWithData > 0;

  let rating = 'good';
  if (!enoughSamples || worstCoverage < 50) rating = 'insufficient';
  else if (anyMissing || worstCoverage < 90) rating = 'fair';

  return {
    rating,
    north: n,
    south: s,
    // The gate. Below this, the UI shows "collecting" rather than a percentage
    // — a savings number computed from three samples is noise wearing a suit.
    savingsClaimSupported: rating !== 'insufficient',
    windowSeconds,
  };
}
