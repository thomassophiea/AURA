import { describe, it, expect } from 'vitest';
import { ambientLightTrigger } from './ambientLightTrigger.js';

const NOW = new Date('2026-08-19T02:00:00Z');

describe('ambientLightTrigger', () => {
  it('reports the open transition state and dwell', () => {
    const t = ambientLightTrigger({ to_state: 'dark', entered_at: '2026-08-19T01:00:00Z' }, NOW);
    expect(t.state).toBe('dark');
    expect(t.dwellSeconds).toBe(3600);
    expect(t.confidence).toBe('high');
  });

  it('returns unknown for a missing row', () => {
    const t = ambientLightTrigger(null, NOW);
    expect(t.state).toBe('unknown');
    expect(t.confidence).toBe('low');
  });

  it('never returns dark for a null row', () => {
    expect(ambientLightTrigger(null, NOW).state).not.toBe('dark');
  });
});
