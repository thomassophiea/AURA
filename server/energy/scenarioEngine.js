/**
 * Replays optimization policies against stored power samples. Read-only: it
 * never touches live config. The controller does not expose per-radio power,
 * so radio-level effects use a band-ratio model (6 GHz ~ 25% of AP draw).
 * Results are labeled "modeled estimate" by the UI, not "measured".
 *
 * All per-sample math is delegated to resolveApState (powerModel.js) so each
 * resource (band, WLAN, chain) can never be double-counted across policies.
 */

import { kwhFromWattSeconds, savingsPercent } from './energyCalculator.js';
import { resolveApState } from './powerModel.js';

/** Modeled share of an AP's draw attributable to a single high-band radio. Kept for external consumers. */
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

/** Translate a What-if policy into resolver optimization descriptors for one sample. */
export function optimizationsForSample(sample, policy = {}) {
  const opts = [];
  if (!Number.isFinite(sample.watts)) return opts;
  const hour = hourOfDayUTC(sample.observedAt);

  if (Array.isArray(policy.disable6GhzHours) && policy.disable6GhzHours.includes(hour)) {
    opts.push({ kind: 'disableRadio', band: '6', source: 'whatif', reason: 'disable6GhzHours' });
  }
  if (
    policy.disableLowUtilRadios &&
    (sample.band == null || String(sample.band) === '6') &&
    Number.isFinite(sample.channelUtilization) &&
    sample.channelUtilization < (policy.lowUtilThresholdPercent ?? 5)
  ) {
    // Low-util targets the idle high-band (6 GHz) radio — same resource as the
    // overnight 6 GHz disable, so the resolver collapses them (no double-count)
    // and the share matches recommendationEngine's SIX_GHZ_BAND_SHARE.
    opts.push({ kind: 'disableRadio', band: '6', source: 'whatif', reason: 'lowUtil' });
  }
  if (policy.reduceTxPower && isAfterHours(hour, policy.afterHoursStart ?? 22, policy.afterHoursEnd ?? 6)) {
    const reducePercent = Number.isFinite(policy.reducePercent) ? policy.reducePercent : 20;
    opts.push({ kind: 'reduceTxPower', reducePercent, source: 'whatif', reason: 'afterHours' });
  }
  return opts;
}

/**
 * Translate a saved Light-Aware policy into resolver descriptors for one sample,
 * keyed on the sample's committed light state. Returns nothing unless the policy
 * is enabled and the sample carries a lightState — combined with the What-if
 * descriptors, the resolver collapses any shared resource (spec §9, no double-count).
 */
function lightAwareOptsForSample(sample, policy = {}) {
  const la = policy?.lightAware;
  if (!la?.enabled || !sample.lightState) return [];
  const actions = la.actionsByState?.[sample.lightState];
  if (!Array.isArray(actions)) return [];
  return actions.map((a) => ({ ...a, source: 'lightAware', reason: sample.lightState }));
}

export function simulatedWattsForSample(sample, policy = {}) {
  if (!Number.isFinite(sample.watts)) return 0;
  const opts = [...optimizationsForSample(sample, policy), ...lightAwareOptsForSample(sample, policy)];
  return resolveApState(sample.watts, opts);
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
  let baselineDailyKwh = 0;
  let simulatedDailyKwh = 0;
  const apsWithData = new Set();

  for (const [deviceExternalId, rows] of byAp.entries()) {
    rows.sort((a, b) => new Date(a.observedAt) - new Date(b.observedAt));
    let apBaselineKwh = 0;
    let apSimulatedKwh = 0;
    let apObservedSeconds = 0;
    for (let i = 0; i < rows.length - 1; i += 1) {
      const elapsed = (new Date(rows[i + 1].observedAt) - new Date(rows[i].observedAt)) / 1000;
      if (!(elapsed > 0) || elapsed > maxGapSeconds) continue;
      apsWithData.add(deviceExternalId);
      apObservedSeconds += elapsed;
      apBaselineKwh += kwhFromWattSeconds(rows[i].watts, elapsed) ?? 0;
      apSimulatedKwh +=
        kwhFromWattSeconds(simulatedWattsForSample(rows[i], policy), elapsed) ?? 0;
    }
    baselineKwh += apBaselineKwh;
    simulatedKwh += apSimulatedKwh;
    if (apObservedSeconds > 0) {
      baselineDailyKwh += (apBaselineKwh / apObservedSeconds) * 86_400;
      simulatedDailyKwh += (apSimulatedKwh / apObservedSeconds) * 86_400;
    }
  }

  const savingsKwh = Math.max(0, baselineKwh - simulatedKwh);
  const savingsDailyKwh = Math.max(0, baselineDailyKwh - simulatedDailyKwh);
  return {
    baselineKwh,
    simulatedKwh,
    savingsKwh,
    baselineDailyKwh,
    simulatedDailyKwh,
    savingsDailyKwh,
    savingsPercent: savingsPercent(baselineKwh, simulatedKwh),
    apWithDataCount: apsWithData.size,
  };
}
