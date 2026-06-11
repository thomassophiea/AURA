import { describe, it, expect } from 'vitest';
import { buildXiqRootCause } from './xiqRootCause';
import type { SLEClassifier, SLEMetric } from '../../types/sle';

const sle = (id: string): SLEMetric => ({
  id,
  name: id,
  scope: 'wireless',
  successRate: 80,
  status: 'warn',
  unit: 'percent',
  totalUserMinutes: 0,
  affectedUserMinutes: 0,
  timeSeries: [],
  classifiers: [],
  description: '',
});
const cls = (id: string): SLEClassifier => ({ id, name: id, impactPercent: 0, affectedClients: 1 });

const clients = [
  { client_mac: 'c1', client_hostname: 'h1', connected_device_hostname: 'AP1', rssi: -55, snr: 35, has_authentication_issues: false },
  { client_mac: 'c2', client_hostname: 'h2', connected_device_hostname: 'AP2', rssi: -82, snr: 10, has_authentication_issues: true },
];
const aps = [
  { device_id: 'ap1', hostname: 'AP1', cpu_usage_percentage: 2, packet_loss: 0, radio_2dot4g_utilization_score: 10 },
  { device_id: 'ap2', hostname: 'AP2', cpu_usage_percentage: 95, packet_loss: 40, radio_2dot4g_utilization_score: 85 },
];

describe('buildXiqRootCause', () => {
  it('lists the weak-signal client for coverage › weak_signal', () => {
    const rc = buildXiqRootCause(cls('weak_signal'), sle('coverage'), clients, aps);
    expect(rc.affectedDevices.map((d) => d.mac)).toEqual(['c2']);
    expect(rc.affectedDevices[0].rssi).toBe(-82);
    expect(rc.recommendations.length).toBeGreaterThan(0);
  });

  it('lists the auth-failing client for successful_connects › authorization', () => {
    const rc = buildXiqRootCause(cls('authorization'), sle('successful_connects'), clients, aps);
    expect(rc.affectedDevices.map((d) => d.mac)).toEqual(['c2']);
  });

  it('lists the congested AP for capacity › packet_loss', () => {
    const rc = buildXiqRootCause(cls('packet_loss'), sle('capacity'), clients, aps);
    expect(rc.affectedAPs.map((a) => a.serial)).toEqual(['ap2']);
  });

  it('lists the high-CPU AP for ap_health › cpu', () => {
    const rc = buildXiqRootCause(cls('cpu'), sle('ap_health'), clients, aps);
    expect(rc.affectedAPs.map((a) => a.serial)).toEqual(['ap2']);
  });

  it('falls back to a generic recommendation for unknown classifiers', () => {
    const rc = buildXiqRootCause(cls('mystery'), sle('coverage'), clients, aps);
    expect(rc.recommendations.length).toBeGreaterThan(0);
    expect(rc.affectedDevices).toHaveLength(0);
  });
});
