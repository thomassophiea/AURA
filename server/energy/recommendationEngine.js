/**
 * Derives energy recommendations on-demand from aggregated patterns in the
 * query window. No background job (Phase 3). Each recommendation states its
 * confidence explicitly; "high" is never claimed on < 3 days of data.
 */

import { randomUUID } from 'node:crypto';

import { dataQualityForDays, estimateCost, projectDaily, projectAnnual } from './energyCalculator.js';
import { replayScenario, SIX_GHZ_BAND_SHARE } from './scenarioEngine.js';

/**
 * Share of samples for an AP whose 6 GHz utilization sits under `threshold`.
 * Restricts consideration to 6 GHz band samples (or untagged); explicitly excludes
 * non-6GHz bands (2.4, 5) to prevent 2.4/5 GHz idle samples from inflating the signal.
 */
function lowUtilFraction(rows, threshold) {
  const band6Only = rows.filter(
    (r) => r.band == null || String(r.band) === '6'
  );
  const withUtil = band6Only.filter((r) => Number.isFinite(r.channelUtilization));
  if (withUtil.length === 0) return 0;
  const low = withUtil.filter((r) => r.channelUtilization < threshold).length;
  return low / withUtil.length;
}

/** Annualize each AP independently, then sum the fleet projection. */
function annualizeScenarioSavings(samples, policy, maxGapSeconds) {
  const byAp = new Map();
  for (const s of samples) {
    if (!byAp.has(s.deviceExternalId)) byAp.set(s.deviceExternalId, []);
    byAp.get(s.deviceExternalId).push(s);
  }

  let fleetAnnualKwh = 0;
  let projectedApCount = 0;
  for (const rows of byAp.values()) {
    rows.sort((a, b) => new Date(a.observedAt) - new Date(b.observedAt));
    let observedSeconds = 0;
    for (let i = 0; i < rows.length - 1; i += 1) {
      const gap = (new Date(rows[i + 1].observedAt) - new Date(rows[i].observedAt)) / 1000;
      if (gap > 0 && gap <= maxGapSeconds) observedSeconds += gap;
    }
    if (observedSeconds === 0) continue;

    const replay = replayScenario({ samples: rows, policy, maxGapSeconds });
    const annualKwh = projectAnnual(projectDaily(replay.savingsKwh, observedSeconds));
    if (!Number.isFinite(annualKwh)) continue;
    fleetAnnualKwh += annualKwh;
    projectedApCount += 1;
  }

  return projectedApCount > 0 ? fleetAnnualKwh : null;
}

export function buildRecommendations({ samples, windowDays, ratePerKwh, maxGapSeconds, lightObserved }) {
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
    const policy = { disableLowUtilRadios: true, lowUtilThresholdPercent: 5 };
    const replay = replayScenario({
      samples: affected,
      policy,
      maxGapSeconds,
    });
    const annualSaving = annualizeScenarioSavings(affected, policy, maxGapSeconds);
    if (replay.apWithDataCount > 0 && replay.savingsKwh > 0 && Number.isFinite(annualSaving)) {
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
      annualSavingsKwh: annualSaving,
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
  }

  // --- light_aware_opportunity ---------------------------------------------
  // Only surfaced when APs actually spent observed time dark (spec §15). Modeled
  // savings = disabling the 6 GHz radio (band share 0.25) over that dark time.
  if (lightObserved && lightObserved.darkApCount > 0 && lightObserved.darkAvgHours > 0) {
    const savingsKwh = (lightObserved.baselineKwhDark ?? 0) * SIX_GHZ_BAND_SHARE;
    const annualFactor = windowDays > 0 ? 365 / windowDays : 0;
    const estimatedAnnualSaving = savingsKwh * annualFactor * (ratePerKwh ?? 0);
    recommendations.push({
      id: randomUUID(),
      type: 'light_aware_opportunity',
      scope: 'fleet',
      title: 'Enable Light-Aware Optimization for dark spaces',
      explanation: `${lightObserved.sensorCapableCount} AP(s) support ambient light sensing; ${lightObserved.darkApCount} averaged ${lightObserved.darkAvgHours.toFixed(1)} h dark during the window. Disabling the idle 6 GHz radio while dark reclaims an estimated ${(SIX_GHZ_BAND_SHARE * 100).toFixed(0)}% of their draw.`,
      affectedApCount: lightObserved.darkApCount,
      baselineKwh: lightObserved.baselineKwhDark ?? 0,
      projectedKwh: (lightObserved.baselineKwhDark ?? 0) - savingsKwh,
      savingsKwh,
      annualSavingsKwh: savingsKwh * annualFactor,
      savingsPercent: SIX_GHZ_BAND_SHARE * 100,
      estimatedAnnualSaving,
      riskLevel: 'low',
      confidenceLevel: confidence,
      supportingData: {
        source: 'light-aware',
        modeled: true,
        observationDays: windowDays,
        sensorCapableApCount: lightObserved.sensorCapableCount,
        observedDarkHoursPerAffectedApDay: lightObserved.darkAvgHours,
        observedDarkHoursPerSensorApDay: lightObserved.darkAvgHoursPerSensorAp ?? null,
        observedDimHoursPerDay: lightObserved.dimAvgHours ?? null,
        modeledPowerReductionPercent: SIX_GHZ_BAND_SHARE * 100,
      },
    });
  }

  return recommendations;
}
