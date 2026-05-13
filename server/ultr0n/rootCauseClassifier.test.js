import { describe, it, expect } from 'vitest';
import { classifyRootCause } from './rootCauseClassifier.js';

describe('classifyRootCause', () => {
  it('classifies low RSSI as COVERAGE', () => {
    const ev = { client: { rssi: -78, snr: 12 }, ap: {}, events: [], missingData: [] };
    const result = classifyRootCause(ev, 'client-disconnect');
    expect(result.category).toBe('COVERAGE');
  });

  it('classifies high channel utilization as RF_CONGESTION', () => {
    const ev = { client: { rssi: -55, snr: 30 }, ap: { channelUtil2g: 85, clientCount: 45 }, events: [], missingData: [] };
    const result = classifyRootCause(ev, 'ap-overloaded');
    expect(result.category).toBe('RF_CONGESTION');
  });

  it('classifies auth failure events as AUTHENTICATION', () => {
    const ev = {
      client: { rssi: -55, snr: 30 },
      ap: {},
      events: [{ type: 'AUTH_FAILURE', description: 'RADIUS timeout' }],
      missingData: [],
    };
    const result = classifyRootCause(ev, 'client-auth-fail');
    expect(result.category).toBe('AUTHENTICATION');
  });

  it('classifies DHCP fail event as DHCP_OR_VLAN', () => {
    const ev = {
      client: { rssi: -60, snr: 25 },
      ap: {},
      events: [{ type: 'DHCP_FAIL', description: 'No DHCP response' }],
      missingData: [],
    };
    const result = classifyRootCause(ev, 'client-dhcp-fail');
    expect(result.category).toBe('DHCP_OR_VLAN');
  });

  it('classifies AP offline as AP_INFRASTRUCTURE', () => {
    const ev = { client: {}, ap: { state: 'DISCONNECTED', rebootCount: 3 }, events: [], missingData: [] };
    const result = classifyRootCause(ev, 'ap-offline');
    expect(result.category).toBe('AP_INFRASTRUCTURE');
  });

  it('returns UNKNOWN when no signals found', () => {
    const ev = { client: {}, ap: {}, events: [], missingData: ['/v1/stations/{mac}'] };
    const result = classifyRootCause(ev, 'unknown');
    expect(result.category).toBe('UNKNOWN');
  });
});
