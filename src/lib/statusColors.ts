/**
 * Semantic status system — the single mapping from raw status strings
 * (controller API values, health verdicts, severity levels) to a small
 * semantic vocabulary, and from that vocabulary to presentation.
 *
 * Why this exists: the codebase previously carried 17 independent
 * status→color functions and 9 status→Badge-variant functions, plus raw
 * Tailwind hue classes (`text-green-500`) that ignored the theme. Every
 * status rendering should route through here so the same state always
 * looks the same, in both themes.
 *
 * Color values resolve through the `--status-*` CSS custom properties,
 * which `applyTheme()` (src/lib/themes.ts) writes per theme from the
 * contrast-tested palette in src/config/colorPalette.ts.
 */

export type SemanticStatus = 'healthy' | 'warning' | 'critical' | 'offline' | 'info' | 'neutral';

/**
 * Raw-value vocabulary fold. Keys are lowercase; match with
 * `normalizeStatus`, never by indexing this map directly.
 */
const STATUS_VOCABULARY: Record<string, SemanticStatus> = {
  // healthy
  online: 'healthy',
  connected: 'healthy',
  up: 'healthy',
  active: 'healthy',
  enabled: 'healthy',
  healthy: 'healthy',
  approved: 'healthy',
  inservice: 'healthy',
  'in service': 'healthy',
  'in-service': 'healthy',
  success: 'healthy',
  successful: 'healthy',
  good: 'healthy',
  excellent: 'healthy',
  optimal: 'healthy',
  ok: 'healthy',
  pass: 'healthy',
  passed: 'healthy',
  compliant: 'healthy',
  authenticated: 'healthy',
  authorized: 'healthy',
  running: 'healthy',
  ready: 'healthy',
  synced: 'healthy',
  'in sync': 'healthy',
  completed: 'healthy',
  bound: 'healthy',
  high: 'healthy',

  // warning
  warning: 'warning',
  warn: 'warning',
  degraded: 'warning',
  pending: 'warning',
  minor: 'warning',
  fair: 'warning',
  stale: 'warning',
  partial: 'warning',
  drift: 'warning',
  expiring: 'warning',
  'needs attention': 'warning',
  medium: 'warning',

  // critical
  critical: 'critical',
  error: 'critical',
  errors: 'critical',
  failed: 'critical',
  failure: 'critical',
  fail: 'critical',
  major: 'critical',
  severe: 'critical',
  malicious: 'critical',
  denied: 'critical',
  rejected: 'critical',
  expired: 'critical',
  poor: 'critical',
  'non-compliant': 'critical',
  noncompliant: 'critical',
  block: 'critical',
  blocked: 'critical',
  low: 'critical',

  // offline — a device/system state, distinct from an alarm severity
  offline: 'offline',
  disconnected: 'offline',
  down: 'offline',
  inactive: 'offline',
  unreachable: 'offline',
  'out of service': 'offline',
  outofservice: 'offline',
  stopped: 'offline',

  // info
  info: 'info',
  informational: 'info',
  notice: 'info',

  // neutral
  disabled: 'neutral',
  unknown: 'neutral',
  none: 'neutral',
  na: 'neutral',
  'n/a': 'neutral',
};

/** Fold any raw status string into the semantic vocabulary. */
export function normalizeStatus(raw: string | null | undefined): SemanticStatus {
  if (!raw) return 'neutral';
  const key = String(raw).trim().toLowerCase();
  if (key in STATUS_VOCABULARY) return STATUS_VOCABULARY[key];
  // CamelCase / snake_case API values like "InService" or "IN_SERVICE"
  const squashed = key.replace(/[\s_-]+/g, '');
  if (squashed in STATUS_VOCABULARY) return STATUS_VOCABULARY[squashed];
  return 'neutral';
}

/** Canonical display label per semantic status (used when the raw value is machine-speak). */
export const STATUS_LABELS: Record<SemanticStatus, string> = {
  healthy: 'Online',
  warning: 'Warning',
  critical: 'Critical',
  offline: 'Offline',
  info: 'Info',
  neutral: 'Unknown',
};

/**
 * Human label for a raw status value: keeps already-presentable values
 * ("Online", "Connected") but rewrites machine values ("InService", "up",
 * "-") into the canonical vocabulary.
 */
export function statusDisplayLabel(raw: string | null | undefined): string {
  if (!raw || raw === '-' || raw === '—') return STATUS_LABELS.neutral;
  const value = String(raw).trim();
  // Already presentable: single capitalized word(s) without camelCase seams.
  const isPresentable = /^[A-Z][a-z]+( [A-Z&][a-z]+)*$/.test(value);
  if (isPresentable) return value;
  return STATUS_LABELS[normalizeStatus(value)];
}

interface StatusTone {
  /** Foreground text class */
  text: string;
  /** Tinted background class (badge/chip surfaces) */
  bg: string;
  /** Border class at reduced alpha */
  border: string;
  /** Solid dot class */
  dot: string;
  /** CSS color expression for inline styles / SVG / AG Grid params */
  color: string;
  /** Matching shared Badge variant */
  badgeVariant: 'success' | 'warning' | 'critical' | 'offline' | 'info' | 'neutral';
}

/**
 * Presentation classes per semantic status. All classes are literal
 * strings (Tailwind JIT requirement) resolving through `--status-*` vars,
 * so they are theme-correct in dark and light automatically.
 */
export const STATUS_TONES: Record<SemanticStatus, StatusTone> = {
  healthy: {
    text: 'text-[color:var(--status-success)]',
    bg: 'bg-[color:var(--status-success)]/12',
    border: 'border-[color:var(--status-success)]/30',
    dot: 'bg-[color:var(--status-success)]',
    color: 'var(--status-success)',
    badgeVariant: 'success',
  },
  warning: {
    text: 'text-[color:var(--status-warning)]',
    bg: 'bg-[color:var(--status-warning)]/12',
    border: 'border-[color:var(--status-warning)]/30',
    dot: 'bg-[color:var(--status-warning)]',
    color: 'var(--status-warning)',
    badgeVariant: 'warning',
  },
  critical: {
    text: 'text-[color:var(--status-error)]',
    bg: 'bg-[color:var(--status-error)]/12',
    border: 'border-[color:var(--status-error)]/30',
    dot: 'bg-[color:var(--status-error)]',
    color: 'var(--status-error)',
    badgeVariant: 'critical',
  },
  offline: {
    text: 'text-[color:var(--status-offline)]',
    bg: 'bg-[color:var(--status-offline)]/12',
    border: 'border-[color:var(--status-offline)]/30',
    dot: 'bg-[color:var(--status-offline)]',
    color: 'var(--status-offline)',
    badgeVariant: 'offline',
  },
  info: {
    text: 'text-[color:var(--status-info)]',
    bg: 'bg-[color:var(--status-info)]/12',
    border: 'border-[color:var(--status-info)]/30',
    dot: 'bg-[color:var(--status-info)]',
    color: 'var(--status-info)',
    badgeVariant: 'info',
  },
  neutral: {
    text: 'text-[color:var(--status-neutral)]',
    bg: 'bg-[color:var(--status-neutral)]/12',
    border: 'border-[color:var(--status-neutral)]/30',
    dot: 'bg-[color:var(--status-neutral)]',
    color: 'var(--status-neutral)',
    badgeVariant: 'neutral',
  },
};

/** Tone lookup for a raw status value in one call. */
export function statusTone(raw: string | null | undefined): StatusTone {
  return STATUS_TONES[normalizeStatus(raw)];
}

/**
 * Severity ordering for sorting (most severe first).
 */
export const STATUS_SEVERITY_ORDER: Record<SemanticStatus, number> = {
  critical: 0,
  offline: 1,
  warning: 2,
  info: 3,
  neutral: 4,
  healthy: 5,
};
