/**
 * Display formatters for the Energy Optimization UI. Every formatter renders a
 * dash for nullish input so a missing measurement can never surface as "NaN"
 * or "$NaN" — the API deliberately sends null rather than a fabricated number.
 */

const DASH = '—';

function nullish(value: number | null | undefined): value is null | undefined {
  return value === null || value === undefined || !Number.isFinite(value);
}

export function formatKwh(value: number | null | undefined, digits = 1): string {
  if (nullish(value)) return DASH;
  return `${value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })} kWh`;
}

export function formatWatts(value: number | null | undefined): string {
  if (nullish(value)) return DASH;
  return `${Math.round(value).toLocaleString('en-US')} W`;
}

export function formatCurrency(value: number | null | undefined, symbol: string): string {
  if (nullish(value)) return DASH;
  return `${symbol}${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (nullish(value)) return DASH;
  return `${value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

export function trendDirection(percent: number | null): 'down' | 'up' | 'flat' {
  if (percent === null || !Number.isFinite(percent) || percent === 0) return 'flat';
  return percent < 0 ? 'down' : 'up';
}

/** The zone the Energy page assumes when the browser cannot name one. */
export const DEFAULT_OPERATOR_TIME_ZONE = 'America/New_York';

/**
 * The operator's IANA time zone, from the browser. Scenario policy hours
 * ("overnight 00:00–06:00") are wall-clock hours in this zone, not UTC.
 */
export function operatorTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === 'string' && zone ? zone : DEFAULT_OPERATOR_TIME_ZONE;
  } catch {
    return DEFAULT_OPERATOR_TIME_ZONE;
  }
}

/** Short label for a zone, e.g. "EDT" — falls back to the IANA name. */
export function timeZoneLabel(timeZone: string, at: Date = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName');
    return part?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

/** Human label for an energy figure's provenance. */
export function powerSourceLabel(source: string | null | undefined): string | null {
  if (source === 'measured_ap_state') return 'Measured AP power';
  if (source === 'ap_report') return 'AP report series (fallback)';
  return null;
}

interface DayStatusLike {
  availability: string;
  selectable: boolean;
  completeness: number;
}

const AVAILABILITY_RANK: Record<string, number> = {
  complete: 4,
  partial: 3,
  unknown: 2,
  empty: 1,
  'outside-retention': 0,
};

/**
 * Merge per-day coverage from two collectors: a day is as available as the
 * BETTER of the two, because the Energy page falls back from measured AP state
 * to the AP report series per AP and per instant.
 */
export function mergeDayStatuses<T extends DayStatusLike>(
  primary: Map<string, T>,
  fallback: Map<string, T>
): Map<string, T> {
  const out = new Map<string, T>(primary);
  for (const [date, status] of fallback) {
    const current = out.get(date);
    if (!current) {
      out.set(date, status);
      continue;
    }
    const rank = (s: T) => AVAILABILITY_RANK[s.availability] ?? 0;
    const better =
      (status.selectable && !current.selectable) ||
      (status.selectable === current.selectable &&
        (rank(status) > rank(current) ||
          (rank(status) === rank(current) && status.completeness > current.completeness)));
    if (better) out.set(date, status);
  }
  return out;
}

interface ActivationSummaryInput {
  simulated?: boolean;
  targetCount?: number;
  appliedCount?: number;
  effectiveCount?: number;
  skippedCount?: number;
  failedCount?: number;
  skipped?: Array<{ reason: string }>;
  failed?: Array<{ reason: string }>;
}

const REASON_LABEL: Record<string, string> = {
  clients_present: 'clients connected',
  already_in_target_state: 'already disabled',
  model_not_verified_for_action: 'model not verified',
  ap_offline: 'AP offline',
  site_moved: 'moved site',
};

function reasonCounts(rows: Array<{ reason: string }> | undefined): string {
  const counts = new Map<string, number>();
  for (const r of rows ?? []) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
  return [...counts.entries()]
    .map(([reason, n]) => `${n} ${REASON_LABEL[reason] ?? reason.replace(/_/g, ' ')}`)
    .join(', ');
}

/**
 * The operator notice after "Activate now (controller)", built from what the
 * server says it did — never a fixed "applied and verified".
 */
export function describeActivation(result: ActivationSummaryInput): string {
  if (result.simulated) return 'Simulation active: no controller writes were issued.';
  const applied = result.appliedCount ?? 0;
  const target = result.targetCount ?? applied;
  const parts = [`Applied to ${applied}/${target} Treatment AP(s)`];
  if (applied > 0 && result.effectiveCount != null) {
    parts.push(`${result.effectiveCount} confirmed off the air`);
  }
  if ((result.skippedCount ?? 0) > 0) {
    parts.push(`${result.skippedCount} skipped (${reasonCounts(result.skipped)})`);
  }
  if ((result.failedCount ?? 0) > 0) {
    parts.push(`${result.failedCount} failed (${reasonCounts(result.failed)})`);
  }
  return `${parts.join('; ')}.`;
}
