import { describe, it, expect } from 'vitest';
import { bucketProtocol, aggregateProtocols } from './ClientProtocolWidget';
import type { Station } from '../../hooks/useDashboardData';

const station = (over: Partial<Station>): Station => ({ macAddress: 'aa', ...over }) as Station;

describe('bucketProtocol', () => {
  it('maps each protocol string to the correct generation bucket', () => {
    expect(bucketProtocol('802.11be')).toBe('be');
    expect(bucketProtocol('802.11ax')).toBe('ax');
    expect(bucketProtocol('802.11ac')).toBe('ac');
    expect(bucketProtocol('802.11n')).toBe('n');
    expect(bucketProtocol('802.11bgn')).toBe('n');
    expect(bucketProtocol('802.11gn')).toBe('n');
    expect(bucketProtocol('802.11ngn')).toBe('n');
    expect(bucketProtocol('802.11g')).toBe('legacy');
    expect(bucketProtocol('802.11a')).toBe('legacy');
    expect(bucketProtocol('802.11b')).toBe('legacy');
  });

  it('is case/whitespace insensitive and tolerates a missing prefix', () => {
    expect(bucketProtocol('  802.11AX ')).toBe('ax');
    expect(bucketProtocol('ac')).toBe('ac');
  });

  it('falls back to "other" for missing or unknown protocols', () => {
    expect(bucketProtocol(undefined)).toBe('other');
    expect(bucketProtocol('')).toBe('other');
    expect(bucketProtocol('wpa3')).toBe('other');
  });
});

describe('aggregateProtocols', () => {
  it('returns an empty array for no stations', () => {
    expect(aggregateProtocols([])).toEqual([]);
  });

  it('counts clients per bucket with correct percentages, sorted by count desc', () => {
    const stations = [
      station({ protocol: '802.11ax' }),
      station({ protocol: '802.11ax' }),
      station({ protocol: '802.11ax' }),
      station({ protocol: '802.11ac' }),
    ];
    const result = aggregateProtocols(stations);
    expect(result.map((b) => b.key)).toEqual(['ax', 'ac']);
    expect(result[0]).toMatchObject({ key: 'ax', count: 3, countPct: 75 });
    expect(result[1]).toMatchObject({ key: 'ac', count: 1, countPct: 25 });
  });

  it('aggregates throughput in Mbps using the normalize convention (>1000 = bits/s, else *1e6)', () => {
    // receivedRate 6 (Mbps shorthand -> 6e6 bits) + transmittedRate 2_000_000 (already bits/s)
    const result = aggregateProtocols([
      station({ protocol: '802.11ax', receivedRate: 6, transmittedRate: 2_000_000 }),
    ]);
    // (6 * 1e6 + 2_000_000) / 1e6 = 8 Mbps
    expect(result[0].throughputMbps).toBeCloseTo(8, 5);
    expect(result[0].throughputPct).toBe(100);
  });

  it('averages signal only over clients with a valid (negative) reading, preferring rssi over rss', () => {
    const result = aggregateProtocols([
      station({ protocol: '802.11ax', rssi: -50 }),
      station({ protocol: '802.11ax', rss: -70 }),
      station({ protocol: '802.11ax' }), // no signal -> excluded from average
    ]);
    expect(result[0].avgSignal).toBe(-60);
  });

  it('splits bands by radioId then channel and reports the top band', () => {
    const result = aggregateProtocols([
      station({ protocol: '802.11ax', radioId: 1 }), // 2.4
      station({ protocol: '802.11ax', radioId: 2 }), // 5
      station({ protocol: '802.11ax', radioId: 2 }), // 5
      station({ protocol: '802.11ax', channel: '149' }), // 5 (by channel)
      station({ protocol: '802.11ax', channel: 6 }), // 2.4 (by channel)
    ]);
    expect(result[0].bands).toEqual({ '2.4': 2, '5': 3, '6': 0 });
    expect(result[0].topBand).toBe('5 GHz');
  });
});
