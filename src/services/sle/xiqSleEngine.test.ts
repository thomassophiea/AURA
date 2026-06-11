import { describe, it, expect } from 'vitest';
import { computeXiqWirelessSLEs } from './xiqSleEngine';

// Rows shaped like the live XIQ dashboard grids (verified against XIQ Global).
const clientRows = [
  // healthy client
  {
    client_mac: 'c1',
    site: 'Scruff',
    rssi: -55,
    snr: 35,
    association_duration: 100,
    authentication_response_time: 200,
    dhcp_ip_assignation_time: 300,
    has_authentication_issues: false,
    has_association_issues: false,
    has_ip_address_issues: false,
    has_roaming_issues: false,
    roaming_time: 0,
    tx_client_retries: 0,
    rx_client_retries: 0,
    slowness: 0,
    air_time_warning: false,
  },
  // weak signal + auth failure + slow connect
  {
    client_mac: 'c2',
    site: 'Scruff',
    rssi: -82,
    snr: 10,
    association_duration: 1000,
    authentication_response_time: 9000,
    dhcp_ip_assignation_time: 200,
    has_authentication_issues: true,
    has_association_issues: false,
    has_ip_address_issues: false,
    has_roaming_issues: true,
    roaming_time: 4000,
    tx_client_retries: 0.3,
    rx_client_retries: 0.1,
    slowness: 1,
    air_time_warning: true,
  },
  // client at a different site (must be excluded when scoping to Scruff)
  { client_mac: 'c3', site: 'Micro', rssi: -90, snr: 5, has_authentication_issues: true },
];

const deviceRows = [
  { device_id: 'ap1', site: 'Scruff', cpu_usage_percentage: 2, memory_usage_percentage: 40, wifi_reboots_count: 0, channel_change_count: 1, has_device_health_issue: false },
  { device_id: 'ap2', site: 'Scruff', cpu_usage_percentage: 95, memory_usage_percentage: 92, wifi_reboots_count: 2, channel_change_count: 5, has_device_health_issue: true },
  { device_id: 'ap3', site: 'Micro', cpu_usage_percentage: 99, memory_usage_percentage: 99, has_device_health_issue: true },
];

const capacityRows = [
  { device_id: 'ap1', site: 'Scruff', radio_2dot4g_utilization_score: 20, radio_5g_utilization_score: 5, has_usage_capacity_issue: false, wifi0_interference_score: 2 },
  { device_id: 'ap2', site: 'Scruff', radio_2dot4g_utilization_score: 85, radio_5g_utilization_score: 10, has_usage_capacity_issue: true, wifi0_interference_score: 75 },
];

describe('computeXiqWirelessSLEs', () => {
  const scruffClients = clientRows.filter((c) => c.site === 'Scruff');
  const scruffDevices = deviceRows.filter((d) => d.site === 'Scruff');
  const sles = computeXiqWirelessSLEs(scruffClients, scruffDevices, capacityRows);

  it('returns the canonical 7 wireless SLEs in OS-ONE order', () => {
    expect(sles.map((s) => s.id)).toEqual([
      'time_to_connect',
      'successful_connects',
      'coverage',
      'roaming',
      'throughput',
      'capacity',
      'ap_health',
    ]);
  });

  it('coverage flags the weak-signal client (1 of 2 on Scruff)', () => {
    const cov = sles.find((s) => s.id === 'coverage')!;
    expect(cov.totalUserMinutes).toBe(2);
    expect(cov.affectedUserMinutes).toBe(1);
    expect(cov.successRate).toBe(50);
    expect(cov.status).toBe('poor');
  });

  it('successful_connects maps auth issues to the Authorization classifier', () => {
    const sc = sles.find((s) => s.id === 'successful_connects')!;
    expect(sc.affectedUserMinutes).toBe(1);
    const auth = sc.classifiers.find((c) => c.id === 'authorization')!;
    expect(auth.affectedClients).toBe(1);
  });

  it('time_to_connect flags the >5s connect and attributes it to Authorization', () => {
    const ttc = sles.find((s) => s.id === 'time_to_connect')!;
    expect(ttc.affectedUserMinutes).toBe(1);
    const auth = ttc.classifiers.find((c) => c.id === 'authorization')!;
    expect(auth.affectedClients).toBe(1); // auth phase dominated (9000ms)
  });

  it('throughput uses retries/airtime/slowness as the signal', () => {
    const tp = sles.find((s) => s.id === 'throughput')!;
    expect(tp.affectedUserMinutes).toBe(1);
  });

  it('ap_health flags the unhealthy AP (cpu/mem/reboots/channel)', () => {
    const ap = sles.find((s) => s.id === 'ap_health')!;
    expect(ap.totalUserMinutes).toBe(2);
    expect(ap.affectedUserMinutes).toBe(1);
    expect(ap.successRate).toBe(50);
  });

  it('capacity flags the congested AP', () => {
    const cap = sles.find((s) => s.id === 'capacity')!;
    expect(cap.totalUserMinutes).toBe(2);
    expect(cap.affectedUserMinutes).toBe(1);
  });

  it('all metrics carry the SLEMetric shape the honeycomb consumes', () => {
    for (const s of sles) {
      expect(s).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        scope: 'wireless',
        successRate: expect.any(Number),
        status: expect.stringMatching(/good|warn|poor/),
        classifiers: expect.any(Array),
      });
      expect(s.successRate).toBeGreaterThanOrEqual(0);
      expect(s.successRate).toBeLessThanOrEqual(100);
    }
  });
});
