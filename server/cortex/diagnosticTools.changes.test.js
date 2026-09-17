import { describe, it, expect, vi } from 'vitest';
import { createDiagnosticTools, TOOL_ACTIVITY } from './diagnosticTools.js';
import { SOURCE_FAMILY } from './evidenceGraph.js';

const SKYNET = {
  id: 's1',
  serviceName: 'Skynet',
  ssid: 'Skynet',
  enabled11kSupport: false,
  mbo: false,
  preAuthenticatedIdleTimeout: 300,
};

const session = (services, { ok = true } = {}) => ({
  get: vi.fn(async (p) =>
    p.startsWith('/v1/services') && ok
      ? { ok: true, status: 200, data: services }
      : { ok: false, status: 500, data: null, errorSummary: 'Exception: null' }
  ),
});

const make = (services, opts) =>
  createDiagnosticTools({
    session: session(services, opts),
    scope: {},
    capabilities: { unusableKeys: () => [], isUsable: () => true },
  });

describe('listAvailableChanges', () => {
  it('is a READ tool, so the investigation agent may call it', () => {
    expect(make([SKYNET]).listAvailableChanges.risk).toBe('read');
  });

  it('is registered for activity and source-family like every other tool', () => {
    expect(TOOL_ACTIVITY.listAvailableChanges).toBeTruthy();
    expect(SOURCE_FAMILY.listAvailableChanges).toBeTruthy();
  });

  it('reports what this Gateway can change on a named WLAN', async () => {
    const out = await make([SKYNET]).listAvailableChanges.handler({ wlanName: 'Skynet' });

    expect(out.available.map((a) => a.id)).toContain('wlan.11k');
    expect(out.available.find((a) => a.id === 'wlan.11k').current).toBe(false);
  });

  it('says which catalogued changes this Gateway does NOT expose', async () => {
    // This service carries no suppressSsid / uapsdEnabled key at all.
    const out = await make([SKYNET]).listAvailableChanges.handler({ wlanName: 'Skynet' });

    expect(out.unavailable.map((u) => u.id)).toContain('wlan.suppressSsid');
    expect(out.unavailable.every((u) => u.reason)).toBe(true);
  });

  it('instructs the model not to propose anything outside `available`', async () => {
    // This is the guard that would have stopped the 802.11r change request.
    const out = await make([SKYNET]).listAvailableChanges.handler({ wlanName: 'Skynet' });
    expect(out.note).toMatch(/COMPLETE set/i);
  });

  it('matches a WLAN case-insensitively', async () => {
    const out = await make([SKYNET]).listAvailableChanges.handler({ wlanName: 'skynet' });
    expect(out.available.length).toBeGreaterThan(0);
  });

  it('does not guess when the WLAN name matches nothing', async () => {
    const out = await make([SKYNET]).listAvailableChanges.handler({ wlanName: 'Warehouse' });

    expect(out.status).toBe('scope_matched_nothing');
    expect(out.available ?? []).toHaveLength(0);
    expect(out.instruction).toMatch(/not.*empty result|do not report/i);
  });

  it('reports a failed read as a failed read, never as "nothing to change"', async () => {
    const out = await make([SKYNET], { ok: false }).listAvailableChanges.handler({
      wlanName: 'Skynet',
    });

    expect(out.status).toBe('fetch_failed');
    expect(out.unavailable).toBe(true);
  });
});
