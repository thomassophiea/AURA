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
