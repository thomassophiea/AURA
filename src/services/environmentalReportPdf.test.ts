import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';

import { createEnvironmentalReportPdf } from './environmentalReportPdf';
import type { EnvironmentalReport } from '@/types/energy';

const report: EnvironmentalReport = {
  reportId: '11111111-1111-4111-8111-111111111111',
  reportType: 'environmental-performance',
  title: 'Extreme Platform ONE Environmental Performance Report',
  subtitle: 'ISO 14001:2026-Aligned Energy Performance Evidence',
  auraVersion: 'test-version',
  generatedAt: '2026-08-17T00:00:00.000Z',
  generatedBy: 'controller-session:test',
  evidenceStatus: 'partially-measured',
  scope: {
    organizationId: null,
    organizationName: null,
    siteGroupId: null,
    siteGroupName: null,
    siteId: 'site-A',
    siteName: 'PrimarySite',
    siteIds: ['site-A'],
    label: 'PrimarySite',
  },
  reportingPeriod: { start: '2026-08-10T00:00:00.000Z', end: '2026-08-17T00:00:00.000Z', days: 7 },
  environmentalAspect: 'Electrical energy consumption associated with wireless network infrastructure.',
  environmentalObjective: 'Reduce wireless infrastructure energy consumption while maintaining defined network availability, capacity, and performance requirements.',
  baseline: {
    measuredKwh: 10,
    averageWattsPerAp: 40,
    currentWatts: 80,
    peakWatts: 100,
    annualKwhProjected: 521.43,
    annualCostProjected: 73,
    reportingApCount: 2,
    totalApCount: 4,
    coveragePercent: 50,
    missingApCount: 2,
    evidenceStatus: 'measured',
  },
  improvement: {
    baselineAnnualKwh: 521.43,
    optimizedAnnualKwh: 495.43,
    annualSavingsKwh: 26,
    annualSavingsPercent: 4.99,
    annualCostSavings: 3.64,
    aggregationMethod: 'Selected modeled opportunity compared with the measured annualized baseline.',
    opportunities: [{
      id: 'rec-1',
      type: 'low_utilization_6ghz',
      recommendation: 'Disable idle 6 GHz radios',
      technicalAction: 'Disable low-utilization 6 GHz radios during qualifying periods.',
      scope: 'PrimarySite',
      affectedApCount: 2,
      baselinePeriodKwh: 2,
      projectedAnnualSavingsKwh: 26,
      projectedReductionPercent: 25,
      projectedAnnualCostSavings: 3.64,
      evidenceStatus: 'modeled',
      confidence: 'high',
      assumptions: { thresholdPercent: 5 },
    }],
  },
  carbon: {
    avoidedKgCo2e: 10.4,
    factor: 0.4,
    factorUnit: 'kg CO2e/kWh',
    source: 'EPA eGRID',
    geographicScope: 'US average',
    sourceYear: 2025,
  },
  financials: { electricityRate: 0.14, currency: 'USD', currencySymbol: '$' },
  provenance: {
    telemetrySource: 'Campus Controller AP power telemetry',
    samplingIntervalSeconds: 300,
    baselineMethodology: 'Measured AP power samples integrated by elapsed time.',
    projectionMethodology: 'Measured period normalized and projected over 365 days.',
    modelAssumptions: [{ type: 'low_utilization_6ghz', assumptions: { thresholdPercent: 5 } }],
    excludedDeviceCount: 2,
    dataQuality: 'high',
    scenarioModelVersion: 'energy-environmental-report-v1',
    reportGeneratedAt: '2026-08-17T00:00:00.000Z',
  },
  disclaimer: 'This report provides environmental performance information that may support an organization’s Environmental Management System. It does not constitute ISO 14001 certification, an audit opinion, or a determination of conformity.',
};

describe('createEnvironmentalReportPdf', () => {
  it('creates a multi-section PDF from the immutable report snapshot', async () => {
    const pdf = await createEnvironmentalReportPdf(report);
    const bytes = pdf.output('arraybuffer');

    expect(bytes.byteLength).toBeGreaterThan(10_000);
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    if (process.env.AURA_PDF_REVIEW_PATH) {
      writeFileSync(process.env.AURA_PDF_REVIEW_PATH, Buffer.from(bytes));
    }
  });
});