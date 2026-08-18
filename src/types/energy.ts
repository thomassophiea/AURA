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
  siteId: string;
  siteName: string;
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
}
