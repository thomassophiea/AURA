/**
 * Replays optimization policies against stored power samples. Read-only: it
 * never touches live config. The controller does not expose per-radio power,
 * so radio-level effects use a band-ratio model (6 GHz ~ 25% of AP draw).
 * Results are labeled "modeled estimate" by the UI, not "measured".
 */

import { kwhFromWattSeconds, savingsPercent } from './energyCalculator.js';

/** Modeled share of an AP's draw attributable to a single high-band radio. */
export const SIX_GHZ_BAND_SHARE = 0.25;

function hourOfDayUTC(iso) {
  return new Date(iso).getUTCHours();
}

/** True when `hour` is in the after-hours window [start, end) that wraps midnight. */
function isAfterHours(hour, start, end) {
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end; // wraps midnight, e.g. 22..6
}

export function simulatedWattsForSample(sample, policy = {}) {
  let watts = sample.watts;
  if (!Number.isFinite(watts)) return 0;
  const hour = hourOfDayUTC(sample.observedAt);

  if (Array.isArray(policy.disable6GhzHours) && policy.disable6GhzHours.includes(hour)) {
    watts *= 1 - SIX_GHZ_BAND_SHARE;
  }

  if (
    policy.disableLowUtilRadios &&
    Number.isFinite(sample.channelUtilization) &&
    sample.channelUtilization < (policy.lowUtilThresholdPercent ?? 5)
  ) {
    watts *= 1 - SIX_GHZ_BAND_SHARE;
  }

  if (
    policy.reduceTxPower &&
    isAfterHours(hour, policy.afterHoursStart ?? 22, policy.afterHoursEnd ?? 6)
  ) {
    const pct = Number.isFinite(policy.reducePercent) ? policy.reducePercent : 20;
    watts *= 1 - pct / 100;
  }

  return watts;
}

/**
 * Integrate baseline and simulated draw over the samples using the same LEAD
 * gap method as the repository: each sample weighted by the gap to the next
 * sample for the same AP; last-per-AP and gaps > maxGapSeconds excluded.
 */
export function replayScenario({ samples, policy, maxGapSeconds }) {
  const byAp = new Map();
  for (const s of samples) {
    if (!byAp.has(s.deviceExternalId)) byAp.set(s.deviceExternalId, []);
    byAp.get(s.deviceExternalId).push(s);
  }

  let baselineKwh = 0;
  let simulatedKwh = 0;
  const apsWithData = new Set();

  for (const [deviceExternalId, rows] of byAp.entries()) {
    rows.sort((a, b) => new Date(a.observedAt) - new Date(b.observedAt));
    for (let i = 0; i < rows.length - 1; i += 1) {
      const elapsed = (new Date(rows[i + 1].observedAt) - new Date(rows[i].observedAt)) / 1000;
      if (!(elapsed > 0) || elapsed > maxGapSeconds) continue;
      apsWithData.add(deviceExternalId);
      baselineKwh += kwhFromWattSeconds(rows[i].watts, elapsed) ?? 0;
      simulatedKwh += kwhFromWattSeconds(simulatedWattsForSample(rows[i], policy), elapsed) ?? 0;
    }
  }

  const savingsKwh = baselineKwh - simulatedKwh;
  return {
    baselineKwh,
    simulatedKwh,
    savingsKwh,
    savingsPercent: savingsPercent(baselineKwh, simulatedKwh),
    apWithDataCount: apsWithData.size,
  };
}
