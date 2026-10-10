import { describe, it, expect } from 'vitest';
import { parseAt } from './historyTools.js';

const NOW = Date.parse('2026-10-10T20:00:00Z');

describe('parseAt', () => {
  it('reads ISO, relative and epoch forms', () => {
    expect(parseAt('2026-10-10T14:00:00Z', NOW).at.toISOString()).toBe('2026-10-10T14:00:00.000Z');
    expect(parseAt('2h ago', NOW).at.getTime()).toBe(NOW - 2 * 3600_000);
    expect(parseAt('-90m', NOW).at.getTime()).toBe(NOW - 90 * 60_000);
    expect(parseAt('1d', NOW).at.getTime()).toBe(NOW - 86_400_000);
    expect(parseAt(NOW - 1000, NOW).at.getTime()).toBe(NOW - 1000);
    expect(parseAt(String(Math.floor((NOW - 5000) / 1000)), NOW).at.getTime()).toBe(NOW - 5000);
  });

  it('refuses the future, beyond retention, and nonsense', () => {
    expect(parseAt('2026-10-11T00:00:00Z', NOW).ok).toBe(false);
    expect(parseAt('40d', NOW).ok).toBe(false);
    expect(parseAt('last tuesday-ish', NOW).ok).toBe(false);
    expect(parseAt('', NOW).ok).toBe(false);
  });
});
