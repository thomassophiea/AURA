/**
 * Readings come from the runtime's ledger, never from the prose.
 *
 * Same rule the scope pill and impact counter already follow: what was measured
 * is rendered from the runtime's own record, so a value the answer forgot to
 * mention still reaches the reader — and a fluent paragraph cannot talk the UI
 * out of a number.
 */
import { describe, it, expect } from 'vitest';
import { keyReadingsFromLedger } from './readings';

const entry = (tool: string, ok: boolean, keyReadings: Record<string, unknown> | null) => ({
  tool,
  args: {},
  ok,
  basis: 'observed',
  ...(keyReadings ? { digest: { tool, keyReadings } } : {}),
});

describe('keyReadingsFromLedger', () => {
  it('reads the client readings off the diagnoseClient digest', () => {
    const r = keyReadingsFromLedger([
      entry('listSites', true, null),
      entry('diagnoseClient', true, { rss: -61, snr: 31, rfqi: 4, downlinkLossRatio: 0.0012, hasIpv4: true }),
    ] as never);
    expect(r).toMatchObject({ rss: -61, snr: 31, rfqi: 4, hasIpv4: true });
  });

  it('keeps an unmeasured reading as null, never as zero', () => {
    // RFQI 0 is a real, bad value on a 0-5 scale. Coercing a missing reading to
    // 0 would paint a healthy client's key tile red.
    const r = keyReadingsFromLedger([
      entry('diagnoseClient', true, { rss: -61, snr: null, rfqi: null, hasIpv4: true }),
    ] as never);
    expect(r!.rfqi).toBeNull();
    expect(r!.snr).toBeNull();
    expect(r!.rss).toBe(-61);
  });

  it('ignores a FAILED call, so absence of data is not shown as data', () => {
    const r = keyReadingsFromLedger([
      entry('diagnoseClient', false, { rss: -61, rfqi: 1, hasIpv4: false }),
    ] as never);
    expect(r).toBeNull();
  });

  it('returns null when every reading is absent', () => {
    // An empty tile row is worse than no tile row.
    const r = keyReadingsFromLedger([
      entry('diagnoseClient', true, { rss: null, snr: null, rfqi: null, hasIpv4: null }),
    ] as never);
    expect(r).toBeNull();
  });

  it('is null for an empty or missing ledger', () => {
    expect(keyReadingsFromLedger([])).toBeNull();
    expect(keyReadingsFromLedger(undefined)).toBeNull();
    expect(keyReadingsFromLedger(null)).toBeNull();
  });

  it('shows an address verdict even when every radio reading is missing', () => {
    // The flex-outage case: /v1/stations gives no SNR or RFQI, but "has an IP"
    // is still a real, useful, proven fact.
    const r = keyReadingsFromLedger([
      entry('diagnoseClient', true, { rss: null, snr: null, rfqi: null, hasIpv4: true }),
    ] as never);
    expect(r).toMatchObject({ hasIpv4: true });
  });
});
