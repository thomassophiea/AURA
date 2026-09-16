import { describe, it, expect, vi } from 'vitest';
import { readScopeInventory, INVENTORY_TIMEOUT_MS } from './scopeInventory.js';

/** The real lab catalogue, as /v3/sites returns it. */
const LAB_SITES = ['PrimarySite', 'AFC LAB', 'CLONE', 'EAL', 'AURA_LAB', 'EAL-PT-S', 'EAL-PT-N'];

const evidenceWith = (rows, { ok = true, error = null } = {}) => ({
  sites: async () => ({ ok, rows, error }),
});

const toolsWith = ({ sites = [], wlans = null, listSites, getWlanConfig } = {}) => ({
  listSites: { handler: listSites ?? (async () => ({ sites })) },
  getWlanConfig:
    getWlanConfig === null ? undefined : { handler: getWlanConfig ?? (async () => wlans) },
});

describe('readScopeInventory', () => {
  it('takes site names from the configured catalogue, not from telemetry', async () => {
    // THE defect. The names live in /v3/sites and cost 0.27 s. Scope resolution
    // was reading them through listSites, which joins client telemetry — so a
    // stalled flex subsystem made "how is PrimarySite overall?" unresolvable
    // against a site that was right there in the config.
    const telemetryStalls = vi.fn(() => new Promise(() => {}));
    const inv = await readScopeInventory({
      evidence: evidenceWith(LAB_SITES.map((siteName) => ({ siteName }))),
      tools: toolsWith({ listSites: telemetryStalls }),
    });

    expect(inv.sites.map((s) => s.name)).toEqual(LAB_SITES);
    expect(telemetryStalls).not.toHaveBeenCalled();
  });

  it('resolves while the telemetry subsystem is down', async () => {
    // A site question must not depend on the health of the thing it asks about.
    // No timer advance: the names must arrive without waiting on any bound.
    vi.useFakeTimers();
    try {
      const inv = await readScopeInventory({
        evidence: evidenceWith([{ siteName: 'PrimarySite' }]),
        tools: toolsWith({ listSites: () => new Promise(() => {}), getWlanConfig: null }),
      });
      expect(inv.sites.map((s) => s.name)).toEqual(['PrimarySite']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not let the optional SSID read hold the site names hostage', async () => {
    vi.useFakeTimers();
    try {
      const promise = readScopeInventory({
        evidence: evidenceWith([{ siteName: 'PrimarySite' }]),
        tools: toolsWith({ getWlanConfig: () => new Promise(() => {}) }),
      });
      // The SSID budget, not the site budget — 3 s, not 8 s.
      await vi.advanceTimersByTimeAsync(3001);
      const inv = await promise;

      expect(inv.sites.map((s) => s.name)).toEqual(['PrimarySite']);
      expect(inv.ssids).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('spends one budget across both site attempts, not one each', async () => {
    // A fallback with a fresh budget makes the worst case twice the bound,
    // which is how a timeout stops being a bound at all.
    vi.useFakeTimers();
    try {
      const promise = readScopeInventory(
        {
          evidence: { sites: () => new Promise(() => {}) },
          tools: toolsWith({ listSites: () => new Promise(() => {}), getWlanConfig: null }),
        },
        { timeoutMs: 8000 }
      );
      await vi.advanceTimersByTimeAsync(8001);

      await expect(promise).resolves.toEqual({ sites: [], ssids: [], apNames: [] });
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports telemetry fields as null, never as zero', async () => {
    // A 0 here is a measurement claim, and this function has measured nothing.
    const inv = await readScopeInventory({
      evidence: evidenceWith([{ siteName: 'PrimarySite' }]),
    });

    expect(inv.sites[0]).toEqual({
      name: 'PrimarySite',
      hasTelemetry: null,
      apCount: null,
      clientCount: null,
    });
  });

  it('accepts either field name the catalogue uses', async () => {
    const inv = await readScopeInventory({
      evidence: evidenceWith([{ siteName: 'PrimarySite' }, { name: 'CLONE' }]),
    });
    expect(inv.sites.map((s) => s.name)).toEqual(['PrimarySite', 'CLONE']);
  });

  it('falls back to the diagnostic tool when /v3/sites is not served', async () => {
    const onDegraded = vi.fn();
    const inv = await readScopeInventory(
      {
        evidence: evidenceWith([], { ok: false, error: 'HTTP 404' }),
        tools: toolsWith({ sites: [{ name: { __untrusted__: true, value: 'PrimarySite' } }] }),
      },
      { onDegraded }
    );

    expect(inv.sites.map((s) => s.name)).toEqual(['PrimarySite']);
    expect(onDegraded).toHaveBeenCalledWith(expect.stringContaining('HTTP 404'));
  });

  it('falls back when the catalogue is served but empty', async () => {
    const inv = await readScopeInventory({
      evidence: evidenceWith([]),
      tools: toolsWith({ sites: [{ name: 'PrimarySite' }] }),
    });
    expect(inv.sites.map((s) => s.name)).toEqual(['PrimarySite']);
  });

  it('gives up in bounded time when the Gateway accepts and then says nothing', async () => {
    // A stalled Gateway never rejects, so a catch-only guard waits forever: the
    // investigate route produced no byte and the edge answered `upstream error`.
    vi.useFakeTimers();
    try {
      const onDegraded = vi.fn();
      const promise = readScopeInventory(
        {
          evidence: { sites: () => new Promise(() => {}) },
          tools: toolsWith({ listSites: () => new Promise(() => {}), getWlanConfig: null }),
        },
        { timeoutMs: 8000, onDegraded }
      );

      await vi.advanceTimersByTimeAsync(8001);
      const inv = await promise;

      expect(inv).toEqual({ sites: [], ssids: [], apNames: [] });
      expect(onDegraded).toHaveBeenCalledWith(expect.stringContaining('timed out'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('collects SSIDs from either shape the WLAN tool returns', async () => {
    const ev = evidenceWith([{ siteName: 'PrimarySite' }]);

    const fromWlans = await readScopeInventory({
      evidence: ev,
      tools: toolsWith({ wlans: { wlans: [{ ssid: { __untrusted__: true, value: 'Skynet' } }] } }),
    });
    expect(fromWlans.ssids).toEqual(['Skynet']);

    const fromServices = await readScopeInventory({
      evidence: ev,
      tools: toolsWith({ wlans: { services: [{ ssid: 'GUEST_2026' }] } }),
    });
    expect(fromServices.ssids).toEqual(['GUEST_2026']);
  });

  it('keeps the site names when the optional WLAN read fails', async () => {
    const inv = await readScopeInventory({
      evidence: evidenceWith([{ siteName: 'PrimarySite' }]),
      tools: toolsWith({
        getWlanConfig: async () => {
          throw new Error('flex subsystem 500');
        },
      }),
    });

    expect(inv.sites.map((s) => s.name)).toEqual(['PrimarySite']);
    expect(inv.ssids).toEqual([]);
  });

  it('returns an empty catalogue rather than throwing when nothing is available', async () => {
    const onDegraded = vi.fn();
    const inv = await readScopeInventory({}, { onDegraded });
    expect(inv).toEqual({ sites: [], ssids: [], apNames: [] });
  });

  it('bounds below the Gateway subsystem failure it exists to survive', async () => {
    // The flex/report subsystem fails as a unit at ~31 s. A bound at or above
    // that would only ever fire after the read had already failed by itself.
    expect(INVENTORY_TIMEOUT_MS).toBeLessThan(31000);
    expect(INVENTORY_TIMEOUT_MS).toBeGreaterThan(1000);
  });
});
