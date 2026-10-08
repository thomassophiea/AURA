import { describe, it, expect } from 'vitest';

import { ScopeBreaker } from './scopeBreaker.js';

const fixed = () => 1; // jitter at its ceiling, so windows are exact

describe('ScopeBreaker', () => {
  it('is closed for a scope it has never seen', () => {
    expect(new ScopeBreaker().isOpen('s', 0)).toBe(false);
  });

  it('opens after a failure and closes once the window passes', () => {
    const b = new ScopeBreaker({ baseSeconds: 300, maxSeconds: 3600, random: fixed });
    b.recordFailure('s', 0);
    expect(b.isOpen('s', 299_000)).toBe(true);
    expect(b.isOpen('s', 300_000)).toBe(false);
  });

  it('doubles the window on each consecutive failure, bounded by the ceiling', () => {
    const b = new ScopeBreaker({ baseSeconds: 300, maxSeconds: 3600, random: fixed });
    expect(b.recordFailure('s', 0)).toBe(300_000);
    expect(b.recordFailure('s', 0)).toBe(600_000);
    expect(b.recordFailure('s', 0)).toBe(1_200_000);
    expect(b.recordFailure('s', 0)).toBe(2_400_000);
    expect(b.recordFailure('s', 0)).toBe(3_600_000);
    expect(b.recordFailure('s', 0)).toBe(3_600_000);
  });

  it('one success fully resets the scope', () => {
    const b = new ScopeBreaker({ random: fixed });
    b.recordFailure('s', 0);
    b.recordFailure('s', 0);
    b.recordSuccess('s');
    expect(b.isOpen('s', 1)).toBe(false);
    expect(b.recordFailure('s', 0)).toBe(300_000);
  });

  it('isolates scopes from each other', () => {
    const b = new ScopeBreaker({ random: fixed });
    b.recordFailure('a', 0);
    expect(b.isOpen('b', 1)).toBe(false);
  });

  it('reports open scopes for operators', () => {
    const b = new ScopeBreaker({ random: fixed });
    b.recordFailure('a', 0);
    expect(b.snapshot(60_000)).toEqual([{ key: 'a', failures: 1, retryInSeconds: 240 }]);
  });
});
