/**
 * Types for the North-vs-South energy experiment API (`/api/energy/experiment/*`).
 *
 * The backend owns every calculation; these types describe what it returns.
 * Nothing here is computed in the browser — in particular `savings`, which is
 * the one payload whose provenance must survive unaltered to the screen.
 */

export type ExperimentState =
  | 'ready'
  | 'collecting_baseline'
  | 'baseline_established'
  | 'darkness_detected'
  | 'optimization_active'
  | 'recovering'
  | 'complete'
  | 'error';

export type ExperimentSide = 'north' | 'south';
export type TriggerSource = 'pending' | 'live_sensor' | 'simulated' | 'manual';
export type EventProvenance = 'live' | 'simulated' | 'calculated';

/** How a savings figure was arrived at. Never collapse these in the UI. */
export type SavingsProvenance =
  /** Real controller action, real measured power on both sides. */
  | 'measured'
  /** Real controller action and real measured power; the TRIGGER was synthetic. */
  | 'measured-telemetry-simulated-trigger'
  /** No controller action was taken; any divergence is modelled. */
  | 'simulated';

export interface ExperimentSiteRef {
  siteId: string;
  siteName: string | null;
}

export interface ExperimentSummaryRow {
  id: string;
  name: string;
  state: ExperimentState;
  north: ExperimentSiteRef;
  south: ExperimentSiteRef;
  baselineStart: string | null;
  baselineEnd: string | null;
  treatmentStart: string | null;
  treatmentEnd: string | null;
  recoveryStart: string | null;
  endedAt: string | null;
  triggerSource: TriggerSource;
  controllerWritesApplied: boolean;
  action: { kind?: string; radioIndexes?: number[]; requireZeroClients?: boolean };
  errorSummary: string | null;
}

export interface ExperimentDevice {
  side: ExperimentSide;
  apSerial: string;
  apName: string | null;
  model: string | null;
  siteId: string;
  siteName: string | null;
  statusAtEnrollment: string | null;
}

export interface ExperimentEvent {
  id: number;
  occurredAt: string;
  kind: string;
  severity: 'info' | 'warning' | 'critical';
  side: ExperimentSide | null;
  apSerial: string | null;
  message: string;
  detail: Record<string, unknown>;
  provenance: EventProvenance;
}

export interface ExperimentRollbackRow {
  apSerial: string;
  capturedAt: string;
  appliedAt: string | null;
  applyVerified: boolean;
  applyError: string | null;
  restoreAttemptedAt: string | null;
  restoreVerified: boolean;
  restoreError: string | null;
}

export interface SideSummary {
  apCount: number;
  apCountWithData: number;
  apCountEnrolled: number;
  wattsPerAp: number | null;
  siteWatts: number | null;
  kwh: number | null;
  observedSeconds: number;
  perAp: Array<{
    apSerial: string;
    model: string | null;
    avgWatts: number | null;
    kwh: number | null;
    observedSeconds: number;
    sampleCount: number;
  }>;
}

export interface BaselineWindow {
  key: '7d' | '3d' | '24h' | 'partial' | null;
  label: string;
  availableHours: number;
  sufficient: boolean;
  start: string | null;
  end: string | null;
  matchedRanges?: number;
  matchedTimeOfDay?: boolean;
}

export interface ExperimentBaseline {
  window: BaselineWindow;
  north: SideSummary;
  south: SideSummary;
  computedAt: string;
  provenance: 'measured';
}

export interface ExperimentSavings {
  withinNorth: { deltaWattsPerAp: number | null; percent: number | null };
  crossSite: { deltaWattsPerAp: number | null; percent: number | null };
  attributed: {
    deltaWattsPerAp: number | null;
    percent: number | null;
    siteWatts: number | null;
    method: string;
    usable: boolean;
  };
  comparability: { ratio: number | null; verdict: string; note: string };
  projected: {
    observedWh: number | null;
    observedKwh: number | null;
    dailyKwh: number | null;
    monthlyKwh: number | null;
    annualKwh: number | null;
    cost: number | null;
    annualCost: number | null;
    co2eKg: number | null;
    annualCo2eKg: number | null;
  } | null;
  elapsedSeconds: number;
  currency: { code: string; symbol: string; ratePerKwh: number };
  emissionsFactorKgPerKwh: number;
  emissionsFactorSource: string;
  provenance: SavingsProvenance;
  claimSupported: boolean;
}

export interface ExperimentQuality {
  rating: 'good' | 'fair' | 'insufficient';
  north: { apCountEnrolled: number; apCountReporting: number; coveragePercent: number | null; missingAps: number };
  south: { apCountEnrolled: number; apCountReporting: number; coveragePercent: number | null; missingAps: number };
  savingsClaimSupported: boolean;
  windowSeconds: number;
}

export interface DemoOverrideState {
  active: boolean;
  mode: 'live_sensor' | 'lights_off' | 'lights_on' | 'sensor_failure';
  startedAt?: string;
  startedBy?: string | null;
  note?: string;
}

export interface OutstandingRestore {
  experimentId: string;
  experimentName: string;
  apSerial: string;
  appliedAt: string;
  restoreAttemptedAt: string | null;
  restoreError: string | null;
  state: ExperimentState;
}

export interface ExperimentStateResponse {
  experiment: ExperimentSummaryRow | null;
  devices?: ExperimentDevice[];
  events?: ExperimentEvent[];
  rollback?: ExperimentRollbackRow[];
  baseline?: ExperimentBaseline;
  treatment?: { north: SideSummary; south: SideSummary; start: string; end: string } | null;
  savings?: ExperimentSavings | null;
  quality?: ExperimentQuality | null;
  demoOverride: DemoOverrideState;
  outstandingRestores: OutstandingRestore[];
}

export interface ExperimentSeriesPoint {
  siteId: string;
  bucketStart: string;
  siteWatts: number | null;
  wattsPerAp: number | null;
  apCount: number;
}

export interface ExperimentSeriesResponse {
  range: string;
  start: string;
  end: string;
  bucketSeconds: number;
  north: ExperimentSiteRef;
  south: ExperimentSiteRef;
  points: ExperimentSeriesPoint[];
  annotations: Array<{ at: string; kind: string; message: string; provenance: EventProvenance }>;
}

export interface ExperimentApRow extends ExperimentDevice {
  currentWatts: number | null;
  observedAt: string | null;
  clients: number | null;
  radios: Array<{ radioIndex: string; band: string | null; txPower?: number | null; enabled?: boolean; clients?: number | null }>;
  energyState: 'control' | 'optimized' | 'normal';
  telemetrySource: 'measured' | 'none';
  rollback: {
    capturedAt: string;
    appliedAt: string | null;
    applyVerified: boolean;
    restoreVerified: boolean;
    restoreError: string | null;
  } | null;
}

export interface ReadinessCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail' | 'unknown';
  detail: string;
  [key: string]: unknown;
}

export interface ReadinessResponse {
  ready: boolean;
  summary: string;
  checks: ReadinessCheck[];
  discovery: unknown;
}

export interface DiscoveryResponse {
  sites: Array<{ siteId: string; siteName: string | null; timezone: string | null }>;
  pair: {
    north: { siteId: string; siteName: string | null } | null;
    south: { siteId: string; siteName: string | null } | null;
    proposed: boolean;
  };
  membership: {
    north: Array<{ serial: string; apName: string | null; model: string | null; status: string | null; watts: number | null }>;
    south: Array<{ serial: string; apName: string | null; model: string | null; status: string | null; watts: number | null }>;
  };
  anomalies: string[];
  configured: { northSiteId: string | null; southSiteId: string | null } | null;
}

export interface ExperimentConfig {
  monitored_source_id: string;
  north_site_id: string | null;
  north_site_name: string | null;
  south_site_id: string | null;
  south_site_name: string | null;
  darkness_threshold_raw: number;
  darkness_persistence_seconds: number;
  recovery_threshold_raw: number;
  recovery_persistence_seconds: number;
  action: Record<string, unknown>;
  enabled: boolean;
}

export interface TriggerView {
  active: boolean;
  state?: ExperimentState;
  darkness?: SideTrigger;
  light?: SideTrigger;
  demoOverride?: DemoOverrideState;
}

export interface SideTrigger {
  mode: 'dark' | 'light';
  perAp: Array<{ serial: string; seconds: number; satisfied: boolean; latestRaw: number | null; stale: boolean; sampleCount: number }>;
  reportingCount: number;
  sensorSilentCount: number;
  satisfiedCount: number;
  quorumRatio: number;
  triggered: boolean;
}
