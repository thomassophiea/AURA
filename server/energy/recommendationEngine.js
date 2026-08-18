/**
 * Derives energy recommendations on-demand from aggregated patterns in the
 * query window. No background job (Phase 3). Each recommendation states its
 * confidence explicitly; "high" is never claimed on < 3 days of data.
 */

import { randomUUID } from 'node:crypto';

import { dataQualityForDays, estimateCost, projectDaily, projectAnnual } from './energyCalculator.js';
import { replayScenario, SIX_GHZ_BAND_SHARE } from './scenarioEngine.js';

/** Share of samples for an AP whose 6 GHz utilization sits under `threshold`. */
function lowUtilFraction(rows, threshold) {
  const withUtil = rows.filter((r) => Number.isFinite(r.channelUtilization));
  if (withUtil.length === 0) return 0;
  const low = withUtil.filter((r) => r.channelUtilization < threshold).length;
  return low / withUtil.length;
}

function annualize(periodKwh, samples, maxGapSeconds) {
  // Total observed seconds across the window, capped per interval, for projection.
  let seconds = 0;
  const byAp = new Map();
  for (const s of samples) {
    if (!byAp.has(s.deviceExternalId)) byAp.set(s.deviceExternalId, []);
    byAp.get(s.deviceExternalId).push(s);
  }
  for (const rows of byAp.values()) {
    rows.sort((a, b) => new Date(a.observedAt) - new Date(b.observedAt));
    for (let i = 0; i < rows.length - 1; i += 1) {
      const gap = (new Date(rows[i + 1].observedAt) - new Date(rows[i].observedAt)) / 1000;
      if (gap > 0 && gap <= maxGapSeconds) seconds += gap;
    }
  }
  // Divide by AP count so projectDaily sees a single-AP-equivalent duration.
  const perApSeconds = byAp.size > 0 ? seconds / byAp.size : 0;
  const daily = projectDaily(periodKwh, perApSeconds);
  return projectAnnual(daily);
}

export function buildRecommendations({ samples, windowDays, ratePerKwh, maxGapSeconds }) {
  const confidence = dataQualityForDays(windowDays);
  const recommendations = [];

  // --- low_utilization_6ghz ------------------------------------------------
  const byAp = new Map();
  for (const s of samples) {
    if (!byAp.has(s.deviceExternalId)) byAp.set(s.deviceExternalId, []);
    byAp.get(s.deviceExternalId).push(s);
  }

  const lowUtilAps = [...byAp.entries()].filter(
    ([, rows]) => lowUtilFraction(rows, 5) > 0.8
  );

  if (lowUtilAps.length > 0) {
    const affected = lowUtilAps.flatMap(([, rows]) => rows);
    const replay = replayScenario({
      samples: affected,
      policy: { disableLowUtilRadios: true, lowUtilThresholdPercent: 5 },
      maxGapSeconds,
    });
    const annualSaving = annualize(replay.savingsKwh, affected, maxGapSeconds);
    recommendations.push({
      id: randomUUID(),
      type: 'low_utilization_6ghz',
      scope: 'fleet',
      title: 'Disable idle 6 GHz radios',
      explanation: `${lowUtilAps.length} AP(s) reported 6 GHz channel utilization under 5% for more than 80% of samples. Powering the idle high-band radio down during those periods reclaims an estimated ${(SIX_GHZ_BAND_SHARE * 100).toFixed(0)}% of their draw.`,
      affectedApCount: lowUtilAps.length,
      baselineKwh: replay.baselineKwh,
      projectedKwh: replay.simulatedKwh,
      savingsKwh: replay.savingsKwh,
      savingsPercent: replay.savingsPercent,
      estimatedAnnualSaving: estimateCost(annualSaving ?? 0, ratePerKwh),
      riskLevel: 'low',
      confidenceLevel: confidence,
      supportingData: {
        observationDays: windowDays,
        lowUtilApCount: lowUtilAps.length,
      },
    });
  }

  return recommendations;
}
