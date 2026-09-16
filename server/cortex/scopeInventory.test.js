import { describe, it, expect, vi } from 'vitest';
import { readScopeInventory, INVENTORY_TIMEOUT_MS } from './scopeInventory.js';

const site = (name, extra = {}) => ({
  name: { __untrusted__: true, value: name },
  hasTelemetry: true,
  apCount: 4,
  clientCount: 12,
  ...extra,
});

const makeTools = ({ sites = [], wlans = null, listSites, getWlanConfig } = {}) => ({
  listSites: { handler: listSites ?? (async () => ({ sites })) },
  getWlanConfig: getWlanConfig === null ? undefined : { handler: getWlanConfig ?? (async () => wlans) },
});

describe('readScopeInventory', () => {
  it('unwraps untrusted site names into plain strings', async () => {
    const inv = await readScopeInventory(makeTools({ sites: [site('PrimarySite')] }));

    expect(inv.sites).toEqual([
      { name: 'PrimarySite', hasTelemetry: true, apCount: 4, clientCount: 12 },
    ]);
  });

  it('collects SSIDs from either shape the WLAN tool returns', async () => {
    const fromWlans = await readScopeInventory(
      makeTools({ wlans: { wlans: [{ ssid: { __untrusted__: true, value: 'Skynet' } }] } })
    );
    expect(fromWlans.ssids).toEqual(['Skynet']);

    const fromServices = await readScopeInventory(
      makeTools({ wlans: { services: [{ ssid: 'GUEST_2026' }] } })
    );
    expect(fromServices.ssids).toEqual(['GUEST_2026']);
  });

  it('gives up in bounded time when the Gateway accepts and then says nothing', async () => {
    // THE defect. A stalled Gateway never rejects, so a catch-only guard waits
    // forever; the investigate route produced no byte and the edge proxy
    // answered the operator with `upstream error`.
    vi.useFakeTimers();
    try {
      const onDegraded = vi.fn();
      const promise = readScopeInventory(
        makeTools({ listSites: () => new Promise(() => {}) }),
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

  it('does not wait for the timeout when the Gateway answers', async () => {
    vi.useFakeTimers();
    try {
      const inv = await readScopeInventory(makeTools({ sites: [site('Beta')] }), {
        timeoutMs: 8000,
      });
      // Resolving without any timer advance is the assertion: a bound that
      // delays the happy path is a different bug.
      expect(inv.sites).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('degrades to an empty catalogue when the site read rejects', async () => {
    const onDegraded = vi.fn();
    const inv = await readScopeInventory(
      makeTools({
        listSites: async () => {
          throw new Error('Gateway 500');
        },
      }),
      { onDegraded }
    );

    expect(inv).toEqual({ sites: [], ssids: [], apNames: [] });
    expect(onDegraded).toHaveBeenCalledWith(expect.stringContaining('Gateway 500'));
  });

  it('still returns sites when only the optional WLAN read fails', async () => {
    const inv = await readScopeInventory(
      makeTools({
        sites: [site('PrimarySite')],
        getWlanConfig: async () => {
          throw new Error('flex subsystem 500');
        },
      })
    );

    expect(inv.sites.map((s) => s.name)).toEqual(['PrimarySite']);
    expect(inv.ssids).toEqual([]);
  });

  it('survives a tool set with no WLAN tool at all', async () => {
    const inv = await readScopeInventory(
      makeTools({ sites: [site('PrimarySite')], getWlanConfig: null })
    );

    expect(inv.sites).toHaveLength(1);
    expect(inv.ssids).toEqual([]);
  });

  it('returns an empty catalogue rather than throwing when listSites is missing', async () => {
    const onDegraded = vi.fn();
    const inv = await readScopeInventory({}, { onDegraded });

    expect(inv).toEqual({ sites: [], ssids: [], apNames: [] });
    expect(onDegraded).toHaveBeenCalled();
  });

  it('bounds below the Gateway subsystem failure it exists to survive', async () => {
    // The flex/report subsystem fails as a unit at ~31 s. A bound at or above
    // that would only ever fire after the read had already failed by itself,
    // which makes it decorative.
    expect(INVENTORY_TIMEOUT_MS).toBeLessThan(31000);
    expect(INVENTORY_TIMEOUT_MS).toBeGreaterThan(1000);
  });
});
