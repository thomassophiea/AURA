/**
 * Types for the Treatment-vs-Control energy experiment API (`/api/energy/experiment/*`).
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

export type ExperimentSide = 'treatment' | 'control';
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

/**
 * How a single figure was arrived at. Distinct from `SavingsProvenance`, which
 * describes a whole savings claim: this labels an individual value so a number
 * on screen can never be mistaken for a different class of number.
 */
export type ValueSource = 'REAL' | 'CALCULATED' | 'DEMO_SIMULATED';

export interface ExperimentSiteRef {
  siteId: string;
  siteName: string | null;
}

export interface ExperimentSummaryRow {
  id: string;
  name: string;
  state: ExperimentState;
  treatment: ExperimentSiteRef;
  control: ExperimentSiteRef;
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
  treatment: SideSummary;
  control: SideSummary;
  computedAt: string;
  provenance: 'measured';
}

export interface ExperimentSavings {
  withinTreatment: { deltaWattsPerAp: number | null; percent: number | null };
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
  valueSource?: ValueSource;
}

export interface ExperimentQuality {
  rating: 'good' | 'fair' | 'insufficient';
  treatment: { apCountEnrolled: number; apCountReporting: number; coveragePercent: number | null; missingAps: number };
  control: { apCountEnrolled: number; apCountReporting: number; coveragePercent: number | null; missingAps: number };
  savingsClaimSupported: boolean;
  windowSeconds: number;
}

export interface DemoOverrideState {
  active: boolean;
  mode: 'live_sensor' | 'lights_off' | 'lights_on' | 'sensor_failure';
  startedAt?: string;
  startedBy?: string | null;
  note?: string;
  /** Non-null when this override is also driving the display-layer projection. */
  projection?: {
    mode: 'lights_off' | 'lights_on';
    startedAt: string;
    fromShare: number;
    episodeId: string | null;
  } | null;
}

/**
 * The demonstration fail-safe, as the server reports it.
 *
 * `active` means an operator switched it on. `applied` means it is actually
 * replacing figures — which it does NOT do when the real measured path is
 * already producing a supported claim (`reason: 'real_telemetry_preferred'`) or
 * when the optimized site has no measured history to project from
 * (`reason: 'no_measured_baseline'`).
 */
export interface DemoSimulationState {
  active: boolean;
  applied: boolean;
  reason:
    | 'demo_simulation_active'
    | 'real_telemetry_preferred'
    | 'no_measured_baseline'
    | 'recovery_complete'
    | string;
  mode: 'lights_off' | 'lights_on';
  startedAt: string;
  valueSource: ValueSource;
  note: string;
  /** Present only when `applied` is true. */
  reductionShare?: number | null;
  baseShare?: number;
  elapsedSeconds?: number;
  apCount?: number;
  baselineWattsPerAp?: number | null;
  /** True when the control side had no live reading and was held at its baseline. */
  controlAssumed?: boolean;
}

export interface DemoEpisode {
  id: string;
  experimentId: string | null;
  siteId: string | null;
  siteName: string | null;
  mode: 'lights_off' | 'lights_on' | 'sensor_failure';
  valueSource: 'DEMO_SIMULATED';
  startedAt: string;
  endedAt: string | null;
  startedBy: string | null;
  endedReason: string | null;
  baselineWattsPerAp: number | null;
  apCount: number | null;
  reductionShare: number | null;
  durationSeconds: number;
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
  treatment?: { treatment: SideSummary; control: SideSummary; start: string; end: string } | null;
  savings?: ExperimentSavings | null;
  quality?: ExperimentQuality | null;
  demoOverride: DemoOverrideState;
  demoSimulation?: DemoSimulationState | null;
  /** The configured pair, present when no experiment has been created yet. */
  pair?: { treatment: ExperimentSiteRef; control: ExperimentSiteRef } | null;
  outstandingRestores: OutstandingRestore[];
}

export interface ExperimentSeriesPoint {
  siteId: string;
  bucketStart: string;
  siteWatts: number | null;
  wattsPerAp: number | null;
  apCount: number;
  /** `DEMO_SIMULATED` on points the fail-safe projected; `REAL` on measured ones. */
  valueSource?: ValueSource;
}

export interface ExperimentSeriesResponse {
  range: string;
  start: string;
  end: string;
  bucketSeconds: number;
  treatment: ExperimentSiteRef;
  control: ExperimentSiteRef;
  points: ExperimentSeriesPoint[];
  annotations: Array<{ at: string; kind: string; message: string; provenance: EventProvenance }>;
}

export interface ExperimentApRow extends ExperimentDevice {
  currentWatts: number | null;
  observedAt: string | null;
  clients: number | null;
  radios: Array<{ radioIndex: string; band: string | null; txPower?: number | null; enabled?: boolean; clients?: number | null }>;
  /** `changed_not_effective`: the write landed and verified, but the radio is
   *  still reporting transmit power — changed, still needs restoring, saving
   *  nothing. */
  energyState: 'control' | 'optimized' | 'changed_not_effective' | 'normal';
  telemetrySource: 'measured' | 'none' | 'DEMO_SIMULATED';
  valueSource?: ValueSource | null;
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
    treatment: { siteId: string; siteName: string | null } | null;
    control: { siteId: string; siteName: string | null } | null;
    proposed: boolean;
    /** `demo_pair` when the named EAL demonstration sites were found. */
    reason?: 'configured' | 'demo_pair' | 'name_heuristic';
    demoPair?: { treatment: string; control: string };
  };
  membership: {
    treatment: Array<{ serial: string; apName: string | null; model: string | null; status: string | null; watts: number | null }>;
    control: Array<{ serial: string; apName: string | null; model: string | null; status: string | null; watts: number | null }>;
  };
  anomalies: string[];
  configured: { treatmentSiteId: string | null; controlSiteId: string | null } | null;
}

export interface ExperimentConfig {
  monitored_source_id: string;
  treatment_site_id: string | null;
  treatment_site_name: string | null;
  control_site_id: string | null;
  control_site_name: string | null;
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
