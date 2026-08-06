/**
 * Types for persisted monitoring history served by `/api/monitoring/*`.
 *
 * These describe stored data. Nothing here is "live" — the backend always
 * reports `servingFrom: 'database'`, and the UI must say so rather than
 * implying a reading is current.
 */

/** How current a stored value is, relative to its source. */
export type FreshnessState = 'fresh' | 'stale' | 'offline' | 'unknown';

/** Source-level state, which additionally distinguishes "never collected". */
export type SourceState = FreshnessState | 'never_collected';

/** Why a stored value's timestamp is what it is. */
export type QualityState =
  | 'observed'
  | 'collection_timestamped'
  | 'counter_reset'
  | 'partial'
  | 'estimated';

export type MetricKind =
  | 'gauge'
  | 'counter'
  | 'counter_delta'
  | 'percentage'
  | 'ratio'
  | 'event_count';

export interface SeriesKey {
  monitoredSourceId: string;
  siteId: string | null;
  deviceExternalId: string | null;
  radioExternalId: string | null;
  wlanExternalId: string | null;
  metricFamily: string;
  metricName: string;
  dimensions: Record<string, string>;
}

export interface SeriesPoint {
  /** UTC ISO-8601. */
  observedAt: string;
  value: number | null;
  /** Present for ratios/percentages so aggregates can be recomputed correctly. */
  numerator: number | null;
  denominator: number | null;
  sampleCount: number | null;
  qualityState: QualityState;
}

/**
 * A period with no observations. Charts must render a break here — never a zero
 * and never a line interpolated across it.
 */
export interface SeriesGap {
  from: string;
  to: string;
  durationSeconds: number;
}

export interface MetricSeries {
  key: SeriesKey;
  unit: string | null;
  metricKind: MetricKind;
  points: SeriesPoint[];
  gaps: SeriesGap[];
}

export interface SourceHealth {
  sourceId: string;
  displayName: string | null;
  orgId: string | null;
  siteGroupId: string | null;
  enabled: boolean;
  state: SourceState;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastSuccessAgeSeconds: number | null;
  consecutiveFailures: number;
  errorClass: string | null;
  errorLabel: string | null;
  /** Always 'database' — stored history is never presented as live. */
  servingFrom: 'database';
  backfillSupported: boolean;
  recentRuns?: CollectionRunSummary[];
}

export interface CollectionRunSummary {
  collectorName: string;
  startedAt: string | null;
  completedAt: string | null;
  status:
    | 'running'
    | 'succeeded'
    | 'partial'
    | 'failed'
    | 'timed_out'
    | 'skipped_due_to_lock';
  recordsInserted: number;
  recordsUpdated: number;
  durationMs: number | null;
  errorClass: string | null;
}

export interface HistoryMeta {
  start: string;
  end: string;
  /**
   * What the caller asked for, as opposed to `start`, which is what was served.
   * They differ when the requested window reached past retention.
   */
  requestedStart: string;
  /** True when `start` was moved forward to the retention boundary. */
  clampedToRetention: boolean;
  /** The oldest instant still retained. Nothing before this is selectable. */
  retentionStart: string;
  retentionDays: number;
  truncated: boolean;
  maxPoints: number;
  pointCount: number;
  /** Oldest sample still stored; null when nothing has ever been collected. */
  earliestAvailable: string | null;
  /** True only when no sample has ever been stored for this scope. */
  neverCollected: boolean;
  /** Present when the window was trimmed by the point cap. */
  effectiveStart?: string | null;
  servingFrom: 'database';
  sources: SourceHealth[];
}

export interface HistoryResponse {
  series: MetricSeries[];
  meta: HistoryMeta;
}

export interface LatestMetric {
  sourceId: string;
  siteId: string | null;
  deviceExternalId: string | null;
  metricFamily: string;
  metricName: string;
  dimensions: Record<string, string>;
  value: number | null;
  numerator: number | null;
  denominator: number | null;
  unit: string | null;
  metricKind: MetricKind;
  qualityState: QualityState;
  observedAt: string;
  collectedAt: string;
  lastSuccessfulContactAt: string | null;
  dataAgeSeconds: number;
  state: FreshnessState;
}

export interface LatestResponse {
  metrics: LatestMetric[];
  meta: {
    staleAfterSeconds: number;
    servingFrom: 'database';
    neverCollected: boolean;
    sources: SourceHealth[];
  };
}

/** What the store holds for one local calendar day. */
export interface CoverageDay {
  /** Local `YYYY-MM-DD` in the requested timezone. */
  localDate: string;
  sampleCount: number;
  firstObservedAt: string;
  lastObservedAt: string;
  /** Distinct local hours containing at least one sample. */
  hoursPresent: number;
}

export interface CoverageResponse {
  days: CoverageDay[];
  meta: {
    timeZone: string;
    start: string;
    end: string;
    requestedStart: string;
    clampedToRetention: boolean;
    retentionStart: string;
    retentionDays: number;
    earliestAvailable: string | null;
    neverCollected: boolean;
    servingFrom: 'database';
    sources: SourceHealth[];
  };
}

export interface SourceHealthResponse {
  sources: SourceHealth[];
  meta: {
    collectorEnabled: boolean;
    pollIntervalSeconds: number;
    retentionDays: number;
    staleAfterSeconds: number;
  };
}

/** Errors the API returns for a range it will not serve. */
export type MonitoringRangeError =
  | 'invalid_range'
  | 'range_too_large'
  | 'range_outside_retention';

export interface MonitoringApiError {
  error: string;
  errorClass?: string;
  detail?: string;
  retentionDays?: number;
}

export class MonitoringRequestError extends Error {
  status: number;
  body: MonitoringApiError;

  constructor(status: number, body: MonitoringApiError) {
    super(body?.detail ?? body?.error ?? `Monitoring request failed (${status})`);
    this.name = 'MonitoringRequestError';
    this.status = status;
    this.body = body;
  }

  /** True when the request was rejected for range reasons, not a server fault. */
  get isRangeError(): boolean {
    return (
      this.status === 400 &&
      ['invalid_range', 'range_too_large', 'range_outside_retention'].includes(
        this.body?.error ?? ''
      )
    );
  }
}
