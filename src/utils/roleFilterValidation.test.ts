import { describe, it, expect } from 'vitest';
import { buildDefaultL2Filter, buildDefaultL3SrcDestFilter } from './roleFilterValidation';

describe('buildDefaultL2Filter', () => {
  it('returns correct default structure', () => {
    const f = buildDefaultL2Filter();
    expect(f).toMatchObject({
      name: '',
      action: 'FILTERACTION_ALLOW',
      macAddress: '',
    });
  });
});

describe('buildDefaultL3SrcDestFilter', () => {
  it('returns correct default structure', () => {
    const f = buildDefaultL3SrcDestFilter();
    expect(f).toMatchObject({
      name: '',
      action: 'FILTERACTION_ALLOW',
      srcIp: '',
      srcPort: 'any',
      dstIp: '',
      dstPort: 'any',
      protocol: 'any',
    });
  });
});
