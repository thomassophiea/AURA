import { randomUUID } from 'node:crypto';

import {
  dataQualityForDays,
  estimateCost,
  projectAnnual,
  projectDaily,
  windowDays,
} from './energyCalculator.js';

const DISCLAIMER =
  'This report provides environmental performance information that may support an organization’s Environmental Management System. It does not constitute ISO 14001 certification, an audit opinion, or a determination of conformity.';

const TECHNICAL_ACTIONS = {
  low_utilization_6ghz: 'Disable low-utilization 6 GHz radios during qualifying periods.',
  light_aware_opportunity: 'Apply the configured Light-Aware policy during measured or modeled dark periods.',
};

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function percent(part, whole) {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  return (part / whole) * 100;
}

export function buildEnvironmentalReport({
  aggregate,
  coverage,
  recommendations,
  preferences,
  windowStart,
  windowEnd,
  siteId,
  siteName,
  authorizedSiteIds,
  includeFinancials,
  includeCarbon,
  recommendationTypes,
  generatedAt,
  generatedBy,
  auraVersion,
}) {
  const days = windowDays(windowStart, windowEnd);
  const seconds = (new Date(windowEnd) - new Date(windowStart)) / 1000;
  const annualKwh = projectAnnual(projectDaily(aggregate.periodKwh, seconds));
  const selected = recommendations.filter(
    (recommendation) =>
      !Array.isArray(recommendationTypes) ||
      recommendationTypes.length === 0 ||
      recommendationTypes.includes(recommendation.type)
  );
  const opportunities = selected.map((recommendation) => {
    const annualSavingsKwh = finiteOrNull(recommendation.annualSavingsKwh) ?? 0;
    return {
      id: recommendation.id ?? recommendation.type,
      type: recommendation.type,
      recommendation: recommendation.title,
      technicalAction:
        TECHNICAL_ACTIONS[recommendation.type] ?? recommendation.explanation,
      scope: recommendation.scope ?? (siteId ? `Site ${siteId}` : 'Fleet'),
      affectedApCount: recommendation.affectedApCount ?? 0,
      baselinePeriodKwh: finiteOrNull(recommendation.baselineKwh),
      projectedAnnualSavingsKwh: annualSavingsKwh,
      projectedReductionPercent: finiteOrNull(recommendation.savingsPercent),
      projectedAnnualCostSavings: includeFinancials
        ? estimateCost(annualSavingsKwh, preferences.ratePerKwh)
        : null,
      evidenceStatus: 'modeled',
      confidence: recommendation.confidenceLevel ?? 'low',
      assumptions: recommendation.supportingData ?? {},
    };
  });

  // Opportunities may overlap. Until the scenario engine supports combined
  // replay, use the largest independent opportunity instead of adding them and
  // overstating savings.
  const annualSavingsKwh = opportunities.reduce(
    (largest, opportunity) => Math.max(largest, opportunity.projectedAnnualSavingsKwh),
    0
  );
  const optimizedAnnualKwh = Number.isFinite(annualKwh)
    ? Math.max(0, annualKwh - annualSavingsKwh)
    : null;
  const annualCostSavings = includeFinancials
    ? estimateCost(annualSavingsKwh, preferences.ratePerKwh)
    : null;
  const factorConfigured =
    Number.isFinite(preferences.emissionsFactorKgPerKwh) &&
    preferences.emissionsFactorKgPerKwh > 0 &&
    Boolean(preferences.emissionsFactorSource);
  const carbon = includeCarbon && factorConfigured
    ? {
        avoidedKgCo2e: annualSavingsKwh * preferences.emissionsFactorKgPerKwh,
        factor: preferences.emissionsFactorKgPerKwh,
        factorUnit: 'kg CO2e/kWh',
        source: preferences.emissionsFactorSource,
        geographicScope: preferences.emissionsFactorRegion ?? null,
        sourceYear: preferences.emissionsFactorYear ?? null,
      }
    : null;
  const totalApCount = Math.max(coverage.totalApCount ?? 0, aggregate.apWithDataCount ?? 0);
  const reportingApCount = aggregate.apWithDataCount ?? 0;
  const evidenceStatus =
    reportingApCount === 0
      ? 'modeled'
      : opportunities.length > 0
        ? 'partially-measured'
        : 'measured';

  return {
    reportId: randomUUID(),
    reportType: 'environmental-performance',
    title: 'Extreme Platform ONE Environmental Performance Report',
    subtitle: 'ISO 14001:2026-Aligned Energy Performance Evidence',
    auraVersion: auraVersion ?? 'unknown',
    generatedAt,
    generatedBy,
    evidenceStatus,
    scope: {
      organizationId: null,
      organizationName: null,
      siteGroupId: null,
      siteGroupName: null,
      siteId: siteId ?? null,
      siteName: siteName ?? null,
      siteIds: siteId ? [siteId] : authorizedSiteIds ?? null,
      label: siteId ? siteName || `Site ${siteId}` : 'All sites',
    },
    reportingPeriod: { start: windowStart, end: windowEnd, days },
    environmentalAspect:
      'Electrical energy consumption associated with wireless network infrastructure.',
    environmentalObjective:
      'Reduce wireless infrastructure energy consumption while maintaining defined network availability, capacity, and performance requirements.',
    baseline: {
      measuredKwh: aggregate.periodKwh,
      averageWattsPerAp: aggregate.avgWatts,
      currentWatts: aggregate.currentWatts,
      peakWatts: aggregate.peakWatts,
      annualKwhProjected: annualKwh,
      annualCostProjected: includeFinancials
        ? estimateCost(annualKwh ?? 0, preferences.ratePerKwh)
        : null,
      reportingApCount,
      totalApCount,
      coveragePercent: percent(reportingApCount, totalApCount),
      missingApCount: Math.max(0, totalApCount - reportingApCount),
      evidenceStatus: 'measured',
    },
    improvement: {
      baselineAnnualKwh: annualKwh,
      optimizedAnnualKwh,
      annualSavingsKwh,
      annualSavingsPercent: percent(annualSavingsKwh, annualKwh),
      annualCostSavings,
      aggregationMethod:
        opportunities.length > 1
          ? 'Largest independent opportunity; overlapping modeled opportunities are not added.'
          : 'Selected modeled opportunity compared with the measured annualized baseline.',
      opportunities,
    },
    carbon,
    financials: includeFinancials
      ? {
          electricityRate: preferences.ratePerKwh,
          currency: preferences.currencyCode,
          currencySymbol: preferences.currencySymbol,
        }
      : null,
    provenance: {
      telemetrySource: 'Campus Controller AP power telemetry',
      samplingIntervalSeconds: coverage.samplingIntervalSeconds ?? null,
      baselineMethodology:
        'Measured AP power samples integrated by elapsed time; stale gaps above the configured maximum are excluded.',
      projectionMethodology:
        'Measured energy in the selected reporting period is normalized to a 24-hour day and projected over 365 days.',
      modelAssumptions: opportunities.map((opportunity) => ({
        type: opportunity.type,
        assumptions: opportunity.assumptions,
      })),
      excludedDeviceCount: Math.max(0, totalApCount - reportingApCount),
      dataQuality: dataQualityForDays(days),
      scenarioModelVersion: 'energy-environmental-report-v1',
      reportGeneratedAt: generatedAt,
    },
    disclaimer: DISCLAIMER,
  };
}