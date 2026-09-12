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

/**
 * Turn a completed experiment into report evidence.
 *
 * Only a run whose controller writes actually landed qualifies as measured. A
 * simulated run is deliberately excluded rather than downgraded: an
 * environmental report is exactly the artifact where a synthetic figure must
 * never appear wearing a measured label.
 */
export function buildControlledExperimentEvidence({
  experimentEvidence,
  preferences,
  includeFinancials,
}) {
  if (!experimentEvidence) return null;
  const { experiment, savings } = experimentEvidence;
  if (!experiment || !savings) return null;
  if (!experiment.controllerWritesApplied) return null;
  if (!savings.claimSupported) return null;

  const annualKwh = finiteOrNull(savings.projected?.annualKwh);
  if (annualKwh == null || annualKwh <= 0) return null;

  const summary = {
    experimentId: experiment.id,
    name: experiment.name,
    treatmentSite: experiment.treatment?.siteName ?? experiment.treatment?.siteId ?? null,
    controlSite: experiment.control?.siteName ?? experiment.control?.siteId ?? null,
    treatmentStart: experiment.treatmentStart ?? null,
    treatmentEnd: experiment.treatmentEnd ?? null,
    triggerSource: experiment.triggerSource,
    observedReductionPercent: finiteOrNull(savings.attributed?.percent),
    observedWattsPerAp: finiteOrNull(savings.attributed?.deltaWattsPerAp),
    observedSiteWatts: finiteOrNull(savings.attributed?.siteWatts),
    attributionMethod: savings.attributed?.method ?? null,
    controlComparability: savings.comparability?.verdict ?? null,
    measurementProvenance: savings.provenance,
    telemetryQuality: experimentEvidence.quality?.rating ?? null,
  };

  return {
    summary,
    opportunity: {
      id: `controlled-experiment-${experiment.id}`,
      type: 'controlled_experiment',
      recommendation: `Apply the verified energy action demonstrated at ${summary.treatmentSite ?? 'the treatment site'}.`,
      technicalAction:
        'Disable the configured AP radios during qualifying environmental conditions, reverting on recovery.',
      scope: summary.treatmentSite ? `Site ${summary.treatmentSite}` : 'Treatment site',
      affectedApCount: experimentEvidence.treatmentApCount ?? 0,
      baselinePeriodKwh: finiteOrNull(experimentEvidence.baselineKwh),
      projectedAnnualSavingsKwh: annualKwh,
      projectedReductionPercent: finiteOrNull(savings.attributed?.percent),
      projectedAnnualCostSavings: includeFinancials
        ? estimateCost(annualKwh, preferences.ratePerKwh)
        : null,
      // The distinguishing claim of this whole feature.
      evidenceStatus: 'measured',
      confidence:
        savings.comparability?.verdict === 'comparable'
          ? 'high'
          : savings.comparability?.verdict === 'similar'
            ? 'medium'
            : 'low',
      assumptions: {
        method: savings.attributed?.method ?? null,
        controlSite: summary.controlSite,
        elapsedSeconds: savings.elapsedSeconds ?? null,
        note:
          'Projected from an observed watt reduction held for the stated hours; it does not assume the action runs continuously.',
      },
    },
  };
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
  // Optional: a completed Treatment-vs-Control experiment. When present it is the
  // strongest evidence the report can carry — a controlled, measured result
  // with a concurrent control group — so it is listed ahead of the modeled
  // opportunities and it raises the report's evidence status.
  experimentEvidence = null,
}) {
  const days = windowDays(windowStart, windowEnd);
  const seconds = (new Date(windowEnd) - new Date(windowStart)) / 1000;
  const dailyKwh = Number.isFinite(aggregate.dailyKwhProjected)
    ? aggregate.dailyKwhProjected
    : projectDaily(aggregate.periodKwh, seconds);
  const annualKwh = projectAnnual(dailyKwh);
  const temporalCoveragePercent =
    Number.isFinite(aggregate.observedSeconds) &&
    Number.isFinite(aggregate.apWithDataCount) &&
    aggregate.apWithDataCount > 0 &&
    seconds > 0
      ? Math.min(
          100,
          (aggregate.observedSeconds / (aggregate.apWithDataCount * seconds)) * 100
        )
      : null;
  const selected = recommendations.filter(
    (recommendation) =>
      !Array.isArray(recommendationTypes) ||
      recommendationTypes.length === 0 ||
      recommendationTypes.includes(recommendation.type)
  );
  const opportunities = selected.map((recommendation) => {
    const modeledAnnualSavingsKwh = Math.max(
      0,
      finiteOrNull(recommendation.annualSavingsKwh) ?? 0
    );
    const annualSavingsKwh = Number.isFinite(annualKwh)
      ? Math.min(modeledAnnualSavingsKwh, annualKwh)
      : modeledAnnualSavingsKwh;
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

  const controlledExperiment = buildControlledExperimentEvidence({
    experimentEvidence,
    preferences,
    includeFinancials,
  });
  if (controlledExperiment?.opportunity) {
    opportunities.unshift(controlledExperiment.opportunity);
  }

  // Opportunities may overlap. Until the scenario engine supports combined
  // replay, use the largest independent opportunity instead of adding them and
  // overstating savings.
  const modeledAnnualSavingsKwh = opportunities.reduce(
    (largest, opportunity) => Math.max(largest, opportunity.projectedAnnualSavingsKwh),
    0
  );
  const annualSavingsKwh = Number.isFinite(annualKwh)
    ? Math.min(modeledAnnualSavingsKwh, annualKwh)
    : modeledAnnualSavingsKwh;
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
      : controlledExperiment && opportunities.length === 1
        // The only opportunity is the measured experiment itself.
        ? 'measured'
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
      temporalCoveragePercent,
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
    controlledExperiment: controlledExperiment?.summary ?? null,
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
      temporalCoveragePercent,
      dataQuality: dataQualityForDays(days),
      controlledExperimentMethodology: controlledExperiment
        ? 'Difference-in-differences against a concurrent control site over matched hours; ' +
          'per-AP normalized. Configuration changes were confirmed by reading device state back.'
        : null,
      scenarioModelVersion: 'energy-environmental-report-v1',
      reportGeneratedAt: generatedAt,
    },
    disclaimer: DISCLAIMER,
  };
}