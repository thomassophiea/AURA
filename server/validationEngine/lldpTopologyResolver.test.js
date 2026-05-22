import { describe, it, expect } from 'vitest';
import { resolveLldpForVlan } from './lldpTopologyResolver.js';

const trunked = (overrides = {}) => ({
  switchPort: '1', systemName: 'sw1',
  vlanMembership: { tagged: [120], untagged: [] },
  ...overrides,
});

const missing = (overrides = {}) => ({
  switchPort: '2', systemName: 'sw1',
  vlanMembership: { tagged: [1, 2], untagged: [1] },
  ...overrides,
});

const extreme = (overrides = {}) => ({
  switchPort: '3', systemName: 'EX4220',
  // no vlanMembership — Extreme Switch Engine
  ...overrides,
});

describe('resolveLldpForVlan', () => {
  it('returns pass when all APs have the VLAN trunked', () => {
    const lldpByAp = [
      { apSerial: 'AP1', neighbors: [trunked()] },
      { apSerial: 'AP2', neighbors: [trunked()] },
    ];
    const r = resolveLldpForVlan(lldpByAp, 120);
    expect(r.result).toBe('pass');
    expect(r.affectedAps).toHaveLength(0);
  });

  it('returns fail when >=50% of APs are missing the VLAN', () => {
    const lldpByAp = [
      { apSerial: 'AP1', neighbors: [missing()] },
      { apSerial: 'AP2', neighbors: [missing()] },
      { apSerial: 'AP3', neighbors: [trunked()] },
    ];
    // 2 of 3 = 67% missing -> fail
    const r = resolveLldpForVlan(lldpByAp, 120);
    expect(r.result).toBe('fail');
    expect(r.affectedAps.some(s => s.includes('AP1'))).toBe(true);
  });

  it('returns warn when <50% of APs are missing the VLAN', () => {
    const lldpByAp = [
      { apSerial: 'AP1', neighbors: [missing()] },
      { apSerial: 'AP2', neighbors: [trunked()] },
      { apSerial: 'AP3', neighbors: [trunked()] },
    ];
    const r = resolveLldpForVlan(lldpByAp, 120);
    expect(r.result).toBe('warn');
  });

  it('returns warn (not fail) for Extreme switch with no vlanMembership', () => {
    const lldpByAp = [
      { apSerial: 'AP1', neighbors: [extreme()] },
      { apSerial: 'AP2', neighbors: [extreme()] },
    ];
    // All indeterminate — should be warn, never fail
    const r = resolveLldpForVlan(lldpByAp, 120);
    expect(r.result).toBe('warn');
  });

  it('filters out empty neighbor entries (bare {} objects)', () => {
    const lldpByAp = [
      { apSerial: 'AP1', neighbors: [{}, trunked()] }, // empty entry + real entry
    ];
    const r = resolveLldpForVlan(lldpByAp, 120);
    expect(r.result).toBe('pass');
  });

  it('returns warn when lldpByAp is empty', () => {
    expect(resolveLldpForVlan([], 120).result).toBe('warn');
  });
});
