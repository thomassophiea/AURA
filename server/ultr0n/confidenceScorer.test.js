import { describe, it, expect } from 'vitest';
import { scoreConfidence } from './confidenceScorer.js';

describe('scoreConfidence', () => {
  it('returns High when root cause is clear with good evidence', () => {
    const ev = {
      client: { rssi: -80, snr: 10, band: '5GHz', apName: 'AP1' },
      ap: { channelUtil2g: 45, clientCount: 10, state: 'CONNECTED' },
      events: [{ type: 'DEAUTH', description: 'low signal' }],
      missingData: [],
    };
    const rc = { category: 'COVERAGE' };
    expect(scoreConfidence(ev, rc)).toBe('High');
  });

  it('returns Low when most data is missing', () => {
    const ev = { client: {}, ap: {}, events: [], missingData: ['/v1/stations/{mac}', '/v1/stations/events/{mac}', '/v1/aps/ifstats/{sn}'] };
    const rc = { category: 'UNKNOWN' };
    expect(scoreConfidence(ev, rc)).toBe('Low');
  });

  it('returns Medium for UNKNOWN root cause with some data', () => {
    const ev = { client: { rssi: -65 }, ap: {}, events: [], missingData: ['/v1/stations/events/{mac}'] };
    const rc = { category: 'UNKNOWN' };
    expect(scoreConfidence(ev, rc)).toBe('Medium');
  });

  it('returns Medium when root cause is clear but events are missing', () => {
    const ev = { client: { rssi: -77 }, ap: {}, events: [], missingData: ['/v1/stations/events/{mac}'] };
    const rc = { category: 'COVERAGE' };
    expect(scoreConfidence(ev, rc)).toBe('Medium');
  });
});
