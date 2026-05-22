import { describe, it, expect } from 'vitest';
import { validateDhcp } from './dhcpValidator.js';

describe('validateDhcp', () => {
  it('returns pass for DHCPRelay with server configured', () => {
    const r = validateDhcp({ name: 'Corp', dhcpMode: 'DHCPRelay', dhcpServers: '10.0.0.1' });
    expect(r.result).toBe('pass');
    expect(r.evidence).toContain('DHCPRelay');
  });

  it('returns warn for DHCPNone', () => {
    const r = validateDhcp({ name: 'Corp', dhcpMode: 'DHCPNone', dhcpServers: '' });
    expect(r.result).toBe('warn');
  });

  it('returns warn for DHCPRelay with empty dhcpServers', () => {
    const r = validateDhcp({ name: 'Corp', dhcpMode: 'DHCPRelay', dhcpServers: '' });
    expect(r.result).toBe('warn');
    expect(r.evidence).toContain('empty');
  });

  it('returns pass for DHCPLocal (no relay needed)', () => {
    const r = validateDhcp({ name: 'Corp', dhcpMode: 'DHCPLocal', dhcpServers: '' });
    expect(r.result).toBe('pass');
  });

  it('returns fail when topology is null', () => {
    expect(validateDhcp(null).result).toBe('fail');
  });
});
