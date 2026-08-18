import { describe, it, expect } from 'vitest';
import {
  formatKwh,
  formatWatts,
  formatCurrency,
  formatPercent,
  trendDirection,
} from './energyCalc';

describe('formatKwh', () => {
  it('formats with a unit', () => {
    expect(formatKwh(12.345)).toBe('12.3 kWh');
  });
  it('returns a dash for nullish', () => {
    expect(formatKwh(null)).toBe('—');
    expect(formatKwh(undefined)).toBe('—');
  });
});

describe('formatWatts', () => {
  it('formats watts', () => {
    expect(formatWatts(1847.3)).toBe('1,847 W');
  });
  it('dashes nullish', () => {
    expect(formatWatts(null)).toBe('—');
  });
});

describe('formatCurrency', () => {
  it('prefixes the symbol and groups thousands', () => {
    expect(formatCurrency(2202.79, '$')).toBe('$2,202.79');
    expect(formatCurrency(31, '€')).toBe('€31.00');
  });
  it('never renders NaN — dashes nullish', () => {
    expect(formatCurrency(null, '$')).toBe('—');
    expect(formatCurrency(undefined, '$')).toBe('—');
  });
});

describe('formatPercent', () => {
  it('formats with sign-free magnitude', () => {
    expect(formatPercent(-5.4)).toBe('-5.4%');
    expect(formatPercent(18.7)).toBe('18.7%');
  });
  it('dashes nullish', () => {
    expect(formatPercent(null)).toBe('—');
  });
});

describe('trendDirection', () => {
  it('maps sign to direction', () => {
    expect(trendDirection(-5)).toBe('down');
    expect(trendDirection(5)).toBe('up');
    expect(trendDirection(0)).toBe('flat');
    expect(trendDirection(null)).toBe('flat');
  });
});
