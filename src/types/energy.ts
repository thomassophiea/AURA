/** Response and view types for the Energy Optimization API (`/api/energy/*`). */

export interface EnergyOverviewMeta {
  dataWindowDays: number | null;
  earliestSampleAt: string | null;
  limitationsNotes: string[];
}

export interface EnergyOverview {
  apWithDataCount: number;
  currentWatts: number;
  avgWatts: number;
  peakWatts: number;
  periodKwh: number;
  dailyKwhProjected: number | null;
  monthlyKwhProjected: number | null;
  annualKwhProjected: number | null;
  estimatedAnnualCost: number | null;
  currency: string;
  currencySymbol: string;
  ratePerKwh: number;
  meta: EnergyOverviewMeta;
}

export interface EnergySite {
  siteId: string | null;
  siteName: string | null;
  apWithDataCount: number;
  totalKwh: number;
  avgWattsPerAp: number;
  estimatedAnnualCost: number | null;
}

export interface EnergyAp {
  serial: string;
  apName: string;
  siteId: string | null;
  avgWatts: number;
  peakWatts: number;
  totalKwh: number;
  estimatedAnnualCost: number | null;
  sampleCount: number;
  dataQuality: 'ok' | 'sparse';
}

export type EnergyRiskLevel = 'low' | 'balanced' | 'high';
export type EnergyConfidence = 'high' | 'medium' | 'low';

export interface EnergyRecommendation {
  id: string;
  type: string;
  scope: string;
  title: string;
  explanation: string;
  affectedApCount: number;
  baselineKwh: number;
  projectedKwh: number;
  savingsKwh: number;
  annualSavingsKwh?: number | null;
  savingsPercent: number | null;
  estimatedAnnualSaving: number | null;
  riskLevel: EnergyRiskLevel;
  confidenceLevel: EnergyConfidence;
  supportingData: Record<string, unknown>;
}

export interface EnergyScenarioPolicy {
  disable6GhzHours?: number[];
  disableLowUtilRadios?: boolean;
  lowUtilThresholdPercent?: number;
  afterHoursStart?: number;
  afterHoursEnd?: number;
  reduceTxPower?: boolean;
  reducePercent?: number;
  lightAware?: {
    enabled: boolean;
    actionsByState?: Partial<Record<LightState, LightActionInput[]>>;
  };
}

export interface EnergyProjectionBlock {
  kwh: number;
  dailyProjected: number | null;
  monthlyProjected: number | null;
  annualProjected: number | null;
  estimatedAnnualCost: number | null;
}

export interface EnergyScenarioResult {
  scenarioId: string;
  baseline: EnergyProjectionBlock;
  simulated: EnergyProjectionBlock;
  savings: {
    kwh: number;
    percent: number | null;
    dailyKwh: number | null;
    monthlyKwh: number | null;
    annualKwh: number | null;
    annualCost: number | null;
  };
  apCount: number;
  apWithDataCount: number;
  computedAt: string;
}

export interface EnergyPreferences {
  currencyCode: string;
  currencySymbol: string;
  ratePerKwh: number;
  emissionsFactorKgPerKwh?: number | null;
  emissionsFactorSource?: string | null;
  emissionsFactorRegion?: string | null;
  emissionsFactorYear?: number | null;
}

export type EnvironmentalEvidenceStatus =
  | 'measured'
  | 'modeled'
  | 'partially-measured'
  | 'verified';

export interface EnvironmentalReportRequest {
  siteId?: string;
  siteName?: string;
  windowStart: string;
  windowEnd: string;
  includeFinancials: boolean;
  includeCarbon: boolean;
  recommendationTypes: string[];
}

export interface EnvironmentalReportOpportunity {
  id: string;
  type: string;
  recommendation: string;
  technicalAction: string;
  scope: string;
  affectedApCount: number;
  baselinePeriodKwh: number | null;
  projectedAnnualSavingsKwh: number;
  projectedReductionPercent: number | null;
  projectedAnnualCostSavings: number | null;
  evidenceStatus: EnvironmentalEvidenceStatus;
  confidence: EnergyConfidence;
  assumptions: Record<string, unknown>;
}

export interface EnvironmentalReport {
  reportId: string;
  reportType: 'environmental-performance';
  title: string;
  subtitle: string;
  auraVersion: string;
  generatedAt: string;
  generatedBy: string;
  evidenceStatus: EnvironmentalEvidenceStatus;
  scope: {
    organizationId: string | null;
    organizationName: string | null;
    siteGroupId: string | null;
    siteGroupName: string | null;
    siteId: string | null;
    siteName: string | null;
    siteIds: string[] | null;
    label: string;
  };
  reportingPeriod: { start: string; end: string; days: number | null };
  environmentalAspect: string;
  environmentalObjective: string;
  baseline: {
    measuredKwh: number;
    averageWattsPerAp: number;
    currentWatts: number;
    peakWatts: number;
    annualKwhProjected: number | null;
    annualCostProjected: number | null;
    reportingApCount: number;
    totalApCount: number;
    coveragePercent: number | null;
    missingApCount: number;
    evidenceStatus: EnvironmentalEvidenceStatus;
  };
  improvement: {
    baselineAnnualKwh: number | null;
    optimizedAnnualKwh: number | null;
    annualSavingsKwh: number;
    annualSavingsPercent: number | null;
    annualCostSavings: number | null;
    aggregationMethod: string;
    opportunities: EnvironmentalReportOpportunity[];
  };
  carbon: {
    avoidedKgCo2e: number;
    factor: number;
    factorUnit: string;
    source: string;
    geographicScope: string | null;
    sourceYear: number | null;
  } | null;
  financials: {
    electricityRate: number;
    currency: string;
    currencySymbol: string;
  } | null;
  provenance: {
    telemetrySource: string;
    samplingIntervalSeconds: number | null;
    baselineMethodology: string;
    projectionMethodology: string;
    modelAssumptions: Array<{ type: string; assumptions: Record<string, unknown> }>;
    excludedDeviceCount: number;
    dataQuality: EnergyConfidence;
    scenarioModelVersion: string;
    reportGeneratedAt: string;
  };
  disclaimer: string;
}

export type LightState = 'bright' | 'dim' | 'dark' | 'unknown';

export interface LightAwareSummary {
  sensorCapableCount: number;
  reportingCount: number;
  stateBreakdown: Record<LightState, number>;
  policyEnabled: boolean;
  projectedAnnual: { kwh: number | null; cost: number | null };
  currency: string;
  currencySymbol: string;
}

export interface LightAwareApRow {
  serial: string;
  apName: string;
  siteId: string | null;
  model: string;
  sensorCapable: boolean;
  lightState: LightState;
  dwellSeconds: number;
  policyEnabled: boolean;
  currentWatts: number;
  optimizedWatts: number;
  savingsWatts: number;
}

export interface LightActionInput {
  kind: 'reduceTxPower' | 'reduceChains' | 'disableRadio' | 'disableWlan' | 'lowPowerProfile';
  band?: '2.4' | '5' | '6';
  reducePercent?: number;
  wlanId?: string;
}

export interface LightAwarePolicyDoc {
  thresholds?: { brightLux: number; darkLux: number };
  hysteresis?: { dimDwellMinutes: number; darkDwellMinutes: number; restoreDwellMinutes: number };
  dim?: { actions: LightActionInput[] };
  dark?: { actions: LightActionInput[] };
  protectedWlanIds?: string[];
  restore?: { toNormal: boolean };
}

export interface LightAwarePolicy {
  enabled: boolean;
  policy: LightAwarePolicyDoc;
}

export interface LightAwareObserved {
  brightPct: number | null;
  dimPct: number | null;
  darkPct: number | null;
  unknownPct: number | null;
  avgDarkHoursPerDay: number | null;
  confidence: 'high' | 'medium' | 'low';
  collecting: boolean;
}
