/**
 * Pure energy math. Every function returns `null` (never NaN/Infinity) when an
 * input is non-finite or would divide by zero, so the API can render a dash
 * instead of a fabricated number.
 */

const MS_PER_DAY = 86_400_000;

function isFiniteNonNegative(value) {
  return Number.isFinite(value) && value >= 0;
}

/** kWh from a constant `watts` held for `seconds`. watts·s / 3600 = Wh; /1000 = kWh. */
export function kwhFromWattSeconds(watts, seconds) {
  if (!isFiniteNonNegative(watts) || !isFiniteNonNegative(seconds)) return null;
  return (watts * seconds) / 3_600_000;
}

/** Scale a period's kWh to a full 24h day. */
export function projectDaily(periodKwh, periodSeconds) {
  if (!Number.isFinite(periodKwh) || !isFiniteNonNegative(periodSeconds) || periodSeconds === 0) {
    return null;
  }
  return periodKwh / (periodSeconds / 86_400);
}

export function projectMonthly(dailyKwh) {
  if (!Number.isFinite(dailyKwh)) return null;
  return dailyKwh * 30;
}

export function projectAnnual(dailyKwh) {
  if (!Number.isFinite(dailyKwh)) return null;
  return dailyKwh * 365;
}

export function estimateCost(kwh, ratePerKwh) {
  if (!isFiniteNonNegative(kwh) || !Number.isFinite(ratePerKwh) || ratePerKwh <= 0) return null;
  return kwh * ratePerKwh;
}

export function savingsPercent(baselineKwh, simulatedKwh) {
  if (!isFiniteNonNegative(baselineKwh) || !Number.isFinite(simulatedKwh) || baselineKwh === 0) {
    return null;
  }
  return ((baselineKwh - simulatedKwh) / baselineKwh) * 100;
}

/** Fractional days between two ISO instants. */
export function windowDays(startISO, endISO) {
  const start = new Date(startISO).getTime();
  const end = new Date(endISO).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return (end - start) / MS_PER_DAY;
}

/** Confidence banding on observation length (spec §7). */
export function dataQualityForDays(days) {
  if (!Number.isFinite(days) || days < 3) return 'low';
  if (days < 7) return 'medium';
  return 'high';
}
