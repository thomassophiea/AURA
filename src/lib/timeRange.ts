/**
 * The single vocabulary for "what window am I looking at" across AURA.
 *
 * Every dashboard, chart, SLE and analytics query resolves its window through
 * `resolveTimeRange`, so one selection means the same thing everywhere and every
 * API call carries explicit start/end timestamps rather than a duration token
 * the backend has to re-interpret.
 *
 * Two kinds of window exist and the distinction is load-bearing:
 *
 *   - **calendar-day** (`day-0` … `day-7`) — a real local calendar day, midnight
 *     to 23:59:59.999 in the *user's* timezone. "Yesterday" means yesterday's
 *     date, not "24 to 48 hours ago". Boundaries are built with the local Date
 *     constructor, so a DST transition correctly yields a 23- or 25-hour day.
 *   - **rolling** (`15m` … `7d`) — a duration ending at now.
 *
 * `isLive` is derived, not declared: a window is live when it ends at now.
 * Today is both a calendar day and live; Yesterday is neither. Callers use it to
 * decide whether to keep polling the controller — a finished day does not change,
 * so re-polling a gateway for it is pure waste, and its data must come from the
 * persisted store.
 */

// ── Tokens ─────────────────────────────────────────────────────────────────

export type TimeRangeKind = 'rolling' | 'calendar-day';

/** Rolling windows, ending at now. */
export const ROLLING_TOKENS = ['15m', '1h', '24h', '3d', '7d'] as const;
export type RollingToken = (typeof ROLLING_TOKENS)[number];

const ROLLING_MS: Record<RollingToken, number> = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

const ROLLING_LABELS: Record<RollingToken, string> = {
  '15m': 'Last 15 minutes',
  '1h': 'Last hour',
  '24h': 'Last 24 hours',
  '3d': 'Last 3 days',
  '7d': 'Last 7 days',
};

/**
 * Suggested bucket size per window, in minutes. Used for chart resolution and
 * for the gap detection the history API performs — a window asked for at the
 * wrong resolution reports gaps that are really just sparser sampling.
 */
const ROLLING_BUCKET_MINUTES: Record<RollingToken, number> = {
  '15m': 1,
  '1h': 5,
  '24h': 15,
  '3d': 30,
  '7d': 60,
};

const DAY_BUCKET_MINUTES = 15;

export const DAY_TOKEN_PREFIX = 'day-';

/** The retention window the backend defaults to; the real value arrives in API meta. */
export const DEFAULT_MAX_DAY_OFFSET = 7;

/** Default selection. Matches the pre-existing dashboard behaviour. */
export const DEFAULT_TIME_RANGE_TOKEN = '24h';

/** `day-3` for an offset of 3 days back from today. */
export function dayToken(offset: number): string {
  return `${DAY_TOKEN_PREFIX}${offset}`;
}

/** Offset in days back from today, or null when `token` is not a day token. */
export function parseDayToken(token: string): number | null {
  if (!token.startsWith(DAY_TOKEN_PREFIX)) return null;
  const raw = token.slice(DAY_TOKEN_PREFIX.length);
  if (!/^\d+$/.test(raw)) return null;
  return Number(raw);
}

export function isRollingToken(token: string): token is RollingToken {
  return (ROLLING_TOKENS as readonly string[]).includes(token);
}

/**
 * Coerce any stored or user-supplied value into a token this module can resolve.
 *
 * Legacy tokens are mapped rather than dropped, so an existing localStorage
 * selection does not leave the dashboard with an unresolvable window:
 *   - `30d` → `7d`. Thirty days is outside retention; serving it would return a
 *     window three quarters empty and imply the network was idle.
 *   - `custom` → the default. No custom-range editor was ever wired up.
 */
export function normalizeTimeRangeToken(
  raw: unknown,
  maxDayOffset: number = DEFAULT_MAX_DAY_OFFSET
): string {
  if (typeof raw !== 'string' || raw === '') return DEFAULT_TIME_RANGE_TOKEN;
  if (isRollingToken(raw)) return raw;

  const offset = parseDayToken(raw);
  if (offset !== null) {
    // Clamp rather than reject: a stored `day-9` after retention was shortened
    // should land on the oldest day still available, not on an error.
    return dayToken(Math.min(offset, maxDayOffset));
  }

  if (raw === '30d') return '7d';
  return DEFAULT_TIME_RANGE_TOKEN;
}

// ── Local calendar-day helpers ─────────────────────────────────────────────

/** The browser's IANA timezone, or 'UTC' when the environment does not report one. */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Local midnight at the start of `date`'s day. */
export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

/**
 * The last representable instant of `date`'s local day.
 *
 * Derived from the *next* day's midnight so a DST shift is absorbed: on a spring
 * -forward day this is 22:59:59.999 + 1h of wall clock, still the correct end.
 */
export function endOfLocalDay(date: Date): Date {
  const nextMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
  return new Date(nextMidnight.getTime() - 1);
}

/** Local calendar date as `YYYY-MM-DD`, without the UTC shift `toISOString` applies. */
export function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The local calendar day `offset` days before `now`. */
export function localDayAtOffset(offset: number, now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset, 0, 0, 0, 0);
}

// ── Labels ─────────────────────────────────────────────────────────────────

const DAY_LABELS: Record<number, string> = { 0: 'Today', 1: 'Yesterday' };

/** 'Today' | 'Yesterday' | '3 Days Ago'. */
export function dayLabel(offset: number): string {
  return DAY_LABELS[offset] ?? `${offset} Days Ago`;
}

function formatLongDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// ── Resolution ─────────────────────────────────────────────────────────────

export interface ResolvedTimeRange {
  token: string;
  kind: TimeRangeKind;
  /** Inclusive start. */
  start: Date;
  /** Inclusive end — now for live windows, 23:59:59.999 for a finished day. */
  end: Date;
  startIso: string;
  endIso: string;
  /** Days back from today for a calendar day; null for rolling windows. */
  dayOffset: number | null;
  /** `YYYY-MM-DD` local date for a calendar day; null for rolling windows. */
  localDate: string | null;
  /** Compact label for the selector trigger. */
  label: string;
  /** Full range for the header, e.g. 'August 5, 2026, 12:00 AM – 11:59 PM'. */
  rangeLabel: string;
  /** True when the window ends at now, so it still tracks incoming data. */
  isLive: boolean;
  /** Suggested bucket size in minutes for charts and gap detection. */
  bucketMinutes: number;
  /** Window length in ms. */
  durationMs: number;
  /** The zone the boundaries were computed in. */
  timeZone: string;
}

/**
 * Resolve a token to concrete local-timezone boundaries.
 *
 * Unknown tokens are normalized rather than thrown on: a stale localStorage
 * value must not be able to break the dashboard on load.
 */
export function resolveTimeRange(token: string, now: Date = new Date()): ResolvedTimeRange {
  const normalized = normalizeTimeRangeToken(token);
  const timeZone = localTimeZone();
  const dayOffset = parseDayToken(normalized);

  if (dayOffset !== null) {
    const dayStart = localDayAtOffset(dayOffset, now);
    const isToday = dayOffset === 0;
    // Today ends at now, not at a midnight still in the future — a chart padded
    // with empty hours reads as an outage rather than as a day in progress.
    const end = isToday ? now : endOfLocalDay(dayStart);
    const label = dayLabel(dayOffset);

    return {
      token: normalized,
      kind: 'calendar-day',
      start: dayStart,
      end,
      startIso: dayStart.toISOString(),
      endIso: end.toISOString(),
      dayOffset,
      localDate: localDateKey(dayStart),
      label,
      rangeLabel: isToday
        ? `${formatLongDate(dayStart)}, ${formatClock(dayStart)} – now`
        : `${formatLongDate(dayStart)}, ${formatClock(dayStart)} – ${formatClock(end)}`,
      isLive: isToday,
      bucketMinutes: DAY_BUCKET_MINUTES,
      durationMs: end.getTime() - dayStart.getTime(),
      timeZone,
    };
  }

  const rolling = normalized as RollingToken;
  const durationMs = ROLLING_MS[rolling];
  const start = new Date(now.getTime() - durationMs);

  return {
    token: rolling,
    kind: 'rolling',
    start,
    end: now,
    startIso: start.toISOString(),
    endIso: now.toISOString(),
    dayOffset: null,
    localDate: null,
    label: ROLLING_LABELS[rolling],
    rangeLabel: `${formatShortDate(start)}, ${formatClock(start)} – now`,
    isLive: true,
    bucketMinutes: ROLLING_BUCKET_MINUTES[rolling],
    durationMs,
    timeZone,
  };
}

// ── Selector options ───────────────────────────────────────────────────────

export interface TimeRangeOption {
  token: string;
  label: string;
  /** Secondary text — the actual date for a day option. */
  detail: string | null;
  kind: TimeRangeKind;
  dayOffset: number | null;
  /** Local `YYYY-MM-DD`, used to join against coverage data. */
  localDate: string | null;
}

export interface TimeRangeOptionGroup {
  id: 'recent' | 'day';
  label: string;
  options: TimeRangeOption[];
}

/**
 * Build the selector's options.
 *
 * Deliberately one flat dropdown in two groups rather than a row of buttons or a
 * free-form date picker: within a 7-day retention window every reachable day is
 * nameable, so typing a date would be more work than picking one.
 *
 * @param maxDayOffset Oldest day offered — the backend's retention in days.
 */
export function timeRangeOptions({
  now = new Date(),
  maxDayOffset = DEFAULT_MAX_DAY_OFFSET,
}: { now?: Date; maxDayOffset?: number } = {}): TimeRangeOptionGroup[] {
  const dayOptions: TimeRangeOption[] = [];
  for (let offset = 0; offset <= maxDayOffset; offset += 1) {
    const day = localDayAtOffset(offset, now);
    dayOptions.push({
      token: dayToken(offset),
      label: dayLabel(offset),
      detail: formatShortDate(day),
      kind: 'calendar-day',
      dayOffset: offset,
      localDate: localDateKey(day),
    });
  }

  return [
    {
      id: 'recent',
      label: 'Recent',
      options: ROLLING_TOKENS.map((token) => ({
        token,
        label: ROLLING_LABELS[token],
        detail: null,
        kind: 'rolling' as const,
        dayOffset: null,
        localDate: null,
      })),
    },
    { id: 'day', label: 'Specific day', options: dayOptions },
  ];
}

/**
 * The venue/AP report `duration` token the controller accepts for a window.
 *
 * Only meaningful for live windows: the controller's report API takes a
 * duration back from now and has no way to express "that Tuesday". Historical
 * windows must be served from the persisted store instead, which is why this
 * returns null for them rather than a token that would quietly return the
 * wrong days.
 */
export function controllerDurationFor(range: ResolvedTimeRange): string | null {
  if (!range.isLive) return null;
  if (range.kind === 'calendar-day') {
    // Today: ask for the smallest duration that covers midnight-to-now.
    const hours = range.durationMs / (60 * 60 * 1000);
    if (hours <= 3) return '3H';
    return '24H';
  }
  switch (range.token as RollingToken) {
    case '15m':
      return '15M';
    case '1h':
      return '1H';
    case '24h':
      return '24H';
    case '3d':
      return '3D';
    case '7d':
      return '7D';
    default:
      return '24H';
  }
}
