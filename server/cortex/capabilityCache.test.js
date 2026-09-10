import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getCapabilitiesFor, clearCapabilityCache, CapabilityRegistry } from './capabilityRegistry.js';

/**
 * A question must never wait for a capability probe.
 *
 * Measured against the lab Gateway, probing cost 67 s (MuTable 16.2s +
 * ApTable 18.0s + neighbours 18.1s + QoE 14.7s) and the endpoint paid it on
 * EVERY question before the model started — the dominant reason Cortex felt
 * slow. Capabilities describe the Gateway build, not the question.
 */
describe('capability probe caching', () => {
  const slowEvidence = () => ({
    clients: vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 40));
      return { ok: true, rows: [{ MAC: 'A', Hostname: 'h', Username: '' }] };
    }),
    radios: vi.fn(async () => ({ ok: true, rows: [{}] })),
    neighbours: vi.fn(async () => ({ ok: true, rows: [{}] })),
    auditLogs: vi.fn(async () => ({ ok: true, entries: [] })),
  });

  beforeEach(() => clearCapabilityCache());

  it('returns a usable registry immediately on a cold cache', () => {
    const t0 = Date.now();
    const { registry, refreshing } = getCapabilitiesFor({ key: 'gw', evidence: slowEvidence() });
    // The measured baseline is itself real truth for this build, so the answer
    // does not have to wait for a re-measurement.
    expect(registry).toBeInstanceOf(CapabilityRegistry);
    expect(registry.usableKeys().length).toBeGreaterThan(20);
    expect(refreshing).toBe(true);
    expect(Date.now() - t0).toBeLessThan(30);
  });

  it('does not start a second probe while one is in flight', () => {
    const ev = slowEvidence();
    const a = getCapabilitiesFor({ key: 'gw', evidence: ev });
    const b = getCapabilitiesFor({ key: 'gw', evidence: ev });
    expect(a.refreshing).toBe(true);
    expect(b.refreshing).toBe(false);
    expect(ev.clients).toHaveBeenCalledTimes(1);
  });

  it('caches per Gateway, so two appliances do not share verdicts', () => {
    const ev1 = slowEvidence();
    const ev2 = slowEvidence();
    getCapabilitiesFor({ key: 'gw-a', evidence: ev1 });
    getCapabilitiesFor({ key: 'gw-b', evidence: ev2 });
    expect(ev1.clients).toHaveBeenCalledTimes(1);
    expect(ev2.clients).toHaveBeenCalledTimes(1);
  });

  it('applies probe findings to later callers once the refresh lands', async () => {
    const ev = {
      clients: async () => ({ ok: true, rows: [{ MAC: 'A', Hostname: '', Username: '' }] }),
      radios: async () => ({ ok: true, rows: [{}] }),
      neighbours: async () => ({ ok: true, rows: [{}] }),
      auditLogs: async () => ({ ok: true, entries: [] }),
    };
    getCapabilitiesFor({ key: 'gw', evidence: ev });
    for (let i = 0; i < 20 && !getCapabilitiesFor({ key: 'gw', evidence: ev, refresh: false }).probedAt; i++) await new Promise((r) => setTimeout(r, 20));
    const { registry, probedAt } = getCapabilitiesFor({ key: 'gw', evidence: ev, refresh: false });
    expect(probedAt).toBeTruthy();
    // No row carried a hostname, so the probe should have downgraded it.
    expect(registry.get('client.hostname').availability).toBe('unavailable');
  });

  it('keeps serving the baseline when a probe throws', async () => {
    const broken = {
      clients: async () => {
        throw new Error('gateway down');
      },
      radios: async () => ({ ok: false, rows: [] }),
      neighbours: async () => ({ ok: false, rows: [] }),
      auditLogs: async () => ({ ok: false }),
    };
    getCapabilitiesFor({ key: 'gw', evidence: broken });
    await new Promise((r) => setTimeout(r, 40));
    const { registry } = getCapabilitiesFor({ key: 'gw', evidence: broken, refresh: false });
    // A failed probe must not poison the registry into claiming nothing works.
    expect(registry.usableKeys().length).toBeGreaterThan(20);
  });

  it('can suppress the background probe entirely', () => {
    const ev = slowEvidence();
    const { refreshing } = getCapabilitiesFor({ key: 'gw', evidence: ev, refresh: false });
    expect(refreshing).toBe(false);
    expect(ev.clients).not.toHaveBeenCalled();
  });
});
