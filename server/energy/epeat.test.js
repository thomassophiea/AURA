import { describe, it, expect } from 'vitest';
import { isEpeatRegisteredApModel, summarizeEpeat, EPEAT_SOURCE } from './epeat.js';

describe('EPEAT registration', () => {
  it('counts the AP4020, including SKU suffixes', () => {
    expect(isEpeatRegisteredApModel('AP4020')).toBe(true);
    expect(isEpeatRegisteredApModel('ap4020-WW')).toBe(true);
  });

  it('does NOT count variants or models no source names', () => {
    for (const model of ['AP4020X', 'AP5020', 'AP5022', 'AP5022FX', 'AP5010U', '', null]) {
      expect(isEpeatRegisteredApModel(model)).toBe(false);
    }
  });

  it('summarises a fleet by model with the share registered', () => {
    const s = summarizeEpeat(['AP4020', 'AP4020', 'AP5022', null, 'AP4020X']);
    expect(s.apCount).toBe(4);
    expect(s.registeredApCount).toBe(2);
    expect(s.registeredShare).toBe(0.5);
    expect(s.models[0]).toEqual({ model: 'AP4020', count: 2, registered: true });
    expect(s.source).toBe(EPEAT_SOURCE);
  });

  it('reports no share, not zero, for an empty fleet', () => {
    expect(summarizeEpeat([]).registeredShare).toBeNull();
  });
});
