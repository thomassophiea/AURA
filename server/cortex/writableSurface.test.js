import { describe, it, expect } from 'vitest';
import { resolveWritableSurface, validateDesiredValue } from './writableSurface.js';
import { getCatalogEntry } from './changeCatalog.js';

/** The live Skynet service, trimmed to the fields the catalogue cares about. */
const LIVE_SKYNET = {
  serviceName: 'Skynet',
  enabled11kSupport: false,
  rm11kBeaconReport: false,
  rm11kQuietIe: false,
  mbo: false,
  clientToClientCommunication: true,
  uapsdEnabled: true,
  suppressSsid: false,
  preAuthenticatedIdleTimeout: 300,
  postAuthenticatedIdleTimeout: 1800,
};

describe('resolveWritableSurface', () => {
  it('offers a catalogued field that this Gateway actually has', () => {
    const { available } = resolveWritableSurface(LIVE_SKYNET);
    const k = available.find((a) => a.id === 'wlan.11k');
    expect(k.current).toBe(false);
    expect(k.label).toBe('802.11k neighbour reports');
  });

  it('NEVER offers a field the live object does not carry', () => {
    // THE 802.11r REGRESSION TEST. A change request was drafted to enable Fast
    // Transition on this exact WLAN. There is no 11r field on any of the 50
    // service keys, so there was nothing to write and nothing to read back —
    // and nothing in the system was positioned to say so.
    const catalog = [
      {
        id: 'wlan.ft',
        label: 'Fast Transition (802.11r)',
        resource: 'service',
        path: 'fastTransition',
        type: 'boolean',
        risk: 'low',
        rationale: '',
        verify: (a, d) => a === d,
      },
    ];
    const { available, unavailable } = resolveWritableSurface(LIVE_SKYNET, catalog);

    expect(available).toHaveLength(0);
    expect(unavailable).toEqual([
      {
        id: 'wlan.ft',
        label: 'Fast Transition (802.11r)',
        reason: 'not exposed on this Gateway',
      },
    ]);
  });

  it('treats an explicit null as a value, not an absence', () => {
    const { available } = resolveWritableSurface({ ...LIVE_SKYNET, mbo: null });
    expect(available.find((a) => a.id === 'wlan.mbo').current).toBeNull();
  });

  it('reports a field missing from this particular service as unavailable', () => {
    const { suppressSsid, ...withoutSuppress } = LIVE_SKYNET;
    const { available, unavailable } = resolveWritableSurface(withoutSuppress);

    expect(available.map((a) => a.id)).not.toContain('wlan.suppressSsid');
    expect(unavailable.map((u) => u.id)).toContain('wlan.suppressSsid');
  });

  it('carries the bounds through, so a preview can state them', () => {
    const { available } = resolveWritableSurface(LIVE_SKYNET);
    const t = available.find((a) => a.id === 'wlan.idleTimeout.preAuth');
    expect(t.min).toBe(5);
    expect(t.max).toBe(999999);
    expect(t.current).toBe(300);
  });

  it('degrades to everything-unavailable rather than throwing on a missing object', () => {
    const { available, unavailable } = resolveWritableSurface(null);
    expect(available).toHaveLength(0);
    expect(unavailable.length).toBeGreaterThan(0);
    expect(unavailable[0].reason).toMatch(/could not be read/i);
  });
});

describe('validateDesiredValue', () => {
  it('accepts a boolean and rejects a non-boolean', () => {
    const e = getCatalogEntry('wlan.11k');
    expect(validateDesiredValue(e, true)).toEqual({ ok: true, value: true });
    expect(validateDesiredValue(e, 'yes').ok).toBe(false);
  });

  it('enforces the Gateway’s own idle-timeout limits', () => {
    const e = getCatalogEntry('wlan.idleTimeout.preAuth');
    // 0 is rejected by the Gateway, and omitting the field gives the SAME 422
    // because it defaults to 0.
    expect(validateDesiredValue(e, 0).ok).toBe(false);
    expect(validateDesiredValue(e, 4).ok).toBe(false);
    expect(validateDesiredValue(e, 5)).toEqual({ ok: true, value: 5 });
    expect(validateDesiredValue(e, 999999)).toEqual({ ok: true, value: 999999 });
    expect(validateDesiredValue(e, 1000000).ok).toBe(false);
  });

  it('names the limits in the error, so the operator can act on it', () => {
    const e = getCatalogEntry('wlan.idleTimeout.preAuth');
    expect(validateDesiredValue(e, 0).error).toMatch(/5.*999999/);
  });

  it('rejects a non-integer rather than silently truncating it', () => {
    const e = getCatalogEntry('wlan.idleTimeout.preAuth');
    expect(validateDesiredValue(e, 30.5).ok).toBe(false);
  });

  it('refuses an unknown entry instead of assuming a default', () => {
    expect(validateDesiredValue(null, true).ok).toBe(false);
  });
});
