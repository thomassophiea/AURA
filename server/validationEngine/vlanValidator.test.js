import { describe, it, expect } from 'vitest';
import { validateVlanExists } from './vlanValidator.js';

const topologies = [
  { id: 'a1', name: 'Corp', vlanid: 1, dhcpMode: 'DHCPRelay', dhcpServers: '10.0.0.1' },
  { id: 'b2', name: 'Guest', vlanid: 120, dhcpMode: 'DHCPRelay', dhcpServers: '10.1.120.1' },
];

describe('validateVlanExists', () => {
  it('returns pass when vlan found', () => {
    const r = validateVlanExists(topologies, 120);
    expect(r.result).toBe('pass');
    expect(r.topology.name).toBe('Guest');
    expect(r.evidence).toContain('120');
  });

  it('returns fail when vlan not found', () => {
    const r = validateVlanExists(topologies, 999);
    expect(r.result).toBe('fail');
    expect(r.topology).toBeNull();
    expect(r.evidence).toContain('999');
  });

  it('returns fail for non-array input', () => {
    const r = validateVlanExists(null, 1);
    expect(r.result).toBe('fail');
  });

  it('matches vlanid by strict number equality (string "120" must NOT match number 120)', () => {
    expect(validateVlanExists(topologies, '120').result).toBe('fail');
    expect(validateVlanExists(topologies, 120).result).toBe('pass');
  });
});
