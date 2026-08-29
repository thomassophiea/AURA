/**
 * Alert routing policy — quiet hours and escalation — as pure functions.
 *
 * Kept separate from the engine so the timing/severity logic is unit-testable
 * without a controller or a database. The engine owns state and side effects;
 * this module only decides.
 */

export const DEFAULT_QUIET_HOURS = {
  enabled: false,
  startHour: 22, // inclusive, local to `tz`
  endHour: 7, // exclusive; wraps past midnight when start > end
  tz: 'UTC',
  allowCritical: true, // criticals still route during quiet hours
};

export const DEFAULT_ESCALATION = {
  enabled: false,
  afterMinutes: 30, // an unacknowledged critical re-notifies after this long
};

/** The wall-clock hour (0–23) at `date` in IANA timezone `tz`. Falls back to UTC. */
export function hourInZone(date, tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(date);
    const h = Number(parts.find((p) => p.type === 'hour')?.value);
    // Intl can render midnight as "24" in some engines; normalize.
    return Number.isFinite(h) ? h % 24 : date.getUTCHours();
  } catch {
    return date.getUTCHours();
  }
}

/** True when `date` falls inside the configured quiet window. */
export function isQuietHour(quiet, date = new Date()) {
  if (!quiet?.enabled) return false;
  const h = hourInZone(date, quiet.tz || 'UTC');
  const { startHour, endHour } = quiet;
  if (startHour === endHour) return false; // empty/degenerate window
  return startHour < endHour
    ? h >= startHour && h < endHour // same-day window
    : h >= startHour || h < endHour; // wraps midnight
}

/**
 * Which of `candidates` (new/reopened actionable alerts) to route now, given
 * the min-severity setting and quiet hours. During quiet hours only criticals
 * route, and only when allowCritical is set; warnings are suppressed (they are
 * still recorded — this only gates the outbound notification).
 */
export function filterForRouting(candidates, { minSeverity, quiet }, date = new Date()) {
  const quietNow = isQuietHour(quiet, date);
  return candidates.filter((a) => {
    const passesMin =
      a.severity === 'critical' || (a.severity === 'warning' && minSeverity !== 'critical');
    if (!passesMin) return false;
    if (quietNow) return a.severity === 'critical' && quiet?.allowCritical !== false;
    return true;
  });
}

/**
 * Critical alerts that are still unacknowledged and unresolved past the
 * escalation threshold and have not already been escalated. `escalatedIds` is
 * the set of alert ids already escalated (so each escalates at most once).
 */
export function alertsToEscalate(activeAlerts, escalation, escalatedIds, date = new Date()) {
  if (!escalation?.enabled) return [];
  const cutoff = date.getTime() - (escalation.afterMinutes ?? 30) * 60_000;
  return activeAlerts.filter(
    (a) =>
      a.severity === 'critical' &&
      !a.resolvedAt &&
      !a.acknowledgedAt &&
      !escalatedIds.has(a.id) &&
      new Date(a.firstSeenAt).getTime() <= cutoff
  );
}
