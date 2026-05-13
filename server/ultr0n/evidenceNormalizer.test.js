import { describe, it, expect } from 'vitest';
import { normalizeEvidence } from './evidenceNormalizer.js';

describe('normalizeEvidence', () => {
  it('extracts client fields from station response', () => {
    const raw = {
      '/v1/stations/{macaddress}': {
        macAddress: 'aa:bb:cc:dd:ee:ff',
        hostname: 'TestDevice',
        rssi: -72,
        snr: 18,
        radioBand: '5GHz',
        apName: 'AP-Floor2',
        ssid: 'CorpWifi',
        stationState: 'CONNECTED',
        retryPercent: 25,
      },
    };
    const ev = normalizeEvidence(raw, 'client-disconnect', {});
    expect(ev.client.rssi).toBe(-72);
    expect(ev.client.snr).toBe(18);
    expect(ev.client.apName).toBe('AP-Floor2');
    expect(ev.client.retryRate).toBe(25);
  });

  it('extracts AP ifstats fields', () => {
    const raw = {
      '/v1/aps/ifstats/{apSerialNumber}': {
        radio0: { channelUtilization: 80, noise: -95 },
        radio1: { channelUtilization: 45 },
        clientCount: 38,
      },
    };
    const ev = normalizeEvidence(raw, 'ap-overloaded', {});
    expect(ev.ap.channelUtil2g).toBe(80);
    expect(ev.ap.clientCount).toBe(38);
  });

  it('extracts events array', () => {
    const raw = {
      '/v1/stations/events/{macaddress}': [
        { timestamp: '2026-01-01T00:00:00Z', eventType: 'DEAUTH', description: 'Deauthenticated' },
      ],
    };
    const ev = normalizeEvidence(raw, 'client-disconnect', {});
    expect(ev.events.length).toBe(1);
    expect(ev.events[0].type).toBe('DEAUTH');
  });

  it('populates missingData from __missingData__', () => {
    const raw = { __missingData__: ['/v1/stations/{mac}'] };
    const ev = normalizeEvidence(raw, 'client-disconnect', {});
    expect(ev.missingData).toContain('/v1/stations/{mac}');
  });
});
