import { describe, it, expect, vi } from 'vitest';
import { applyWlanChange } from './wlanModifyEngine.js';

const SERVICE = {
  id: 'c8d4880b-2a54-424e-9459-46c02425f587',
  serviceName: 'Skynet',
  ssid: 'Skynet',
  enabled11kSupport: false,
  dot1dPortNumber: 101,
  dscp: { codePoints: [2, 0] },
  features: ['CENTRALIZED-SITE'],
};

/**
 * `requestXcc` ALWAYS sends an explicit method (default 'GET'), so a stub
 * matching `init.method === undefined` silently never fires and every read
 * 404s. Match on init.method.
 */
function stub({ afterPut }) {
  const calls = [];
  const fetchFn = vi.fn(async (url, init) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null });
    if (init.method === 'PUT') {
      return { ok: true, status: 200, text: async () => '' };
    }
    const seenPut = calls.some((c) => c.method === 'PUT');
    const body = seenPut ? afterPut : SERVICE;
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  });
  return { fetchFn, calls };
}

const base = { serviceId: SERVICE.id, authToken: 'Bearer x', controllerUrl: 'https://gw' };

describe('applyWlanChange', () => {
  it('applies the change and proves it by reading back', async () => {
    const { fetchFn } = stub({ afterPut: { ...SERVICE, enabled11kSupport: true } });
    const r = await applyWlanChange({ ...base, changeId: 'wlan.11k', desired: true, fetchFn });

    expect(r.status).toBe('applied');
    expect(r.before).toBe(false);
    expect(r.after).toBe(true);
  });

  it('reports a write the Gateway accepted and discarded as a FAILURE', async () => {
    // The dominant failure mode of this platform: 200, field unchanged.
    const { fetchFn } = stub({ afterPut: SERVICE });
    const r = await applyWlanChange({ ...base, changeId: 'wlan.11k', desired: true, fetchFn });

    expect(r.status).toBe('silently_dropped');
    expect(r.after).toBe(false);
    expect(r.error).toMatch(/discarded, not applied/i);
  });

  it('PUTs the WHOLE object back, mutating exactly one field', async () => {
    // A partial body wipes fields on this Gateway.
    const { fetchFn, calls } = stub({ afterPut: { ...SERVICE, enabled11kSupport: true } });
    await applyWlanChange({ ...base, changeId: 'wlan.11k', desired: true, fetchFn });

    const put = calls.find((c) => c.method === 'PUT');
    expect(put.body).toEqual({ ...SERVICE, enabled11kSupport: true });
    expect(put.body.dscp).toEqual(SERVICE.dscp);
    expect(put.body.features).toEqual(SERVICE.features);
  });

  it('surfaces a Gateway rejection with its own message', async () => {
    const fetchFn = vi.fn(async (url, init) => {
      if (init.method === 'PUT') {
        return { ok: false, status: 422, text: async () => 'idle timeout value 0 is invalid' };
      }
      return { ok: true, status: 200, json: async () => SERVICE, text: async () => '' };
    });
    const r = await applyWlanChange({ ...base, changeId: 'wlan.11k', desired: true, fetchFn });

    expect(r.status).toBe('rejected');
    expect(r.httpStatus).toBe(422);
    expect(r.error).toMatch(/idle timeout/);
  });

  it('keeps "we could not check" distinct from "it did not work"', async () => {
    let puts = 0;
    const fetchFn = vi.fn(async (url, init) => {
      if (init.method === 'PUT') {
        puts++;
        return { ok: true, status: 200, text: async () => '' };
      }
      if (puts) return { ok: false, status: 500, text: async () => 'Exception: null' };
      return { ok: true, status: 200, json: async () => SERVICE, text: async () => '' };
    });
    const r = await applyWlanChange({ ...base, changeId: 'wlan.11k', desired: true, fetchFn });

    expect(r.status).toBe('read_failed');
    expect(r.status).not.toBe('silently_dropped');
  });

  it('reports a failed first read without attempting a write', async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 500, text: async () => 'Exception: null' }));
    const r = await applyWlanChange({ ...base, changeId: 'wlan.11k', desired: true, fetchFn });

    expect(r.status).toBe('read_failed');
    expect(fetchFn.mock.calls.every(([, init]) => init.method === 'GET')).toBe(true);
  });

  it('refuses a value the catalogue does not allow, without touching the Gateway', async () => {
    const { fetchFn } = stub({ afterPut: SERVICE });
    const r = await applyWlanChange({
      ...base,
      changeId: 'wlan.idleTimeout.preAuth',
      desired: 0,
      fetchFn,
    });

    expect(r.status).toBe('invalid');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('refuses a change that is not in the catalogue', async () => {
    const { fetchFn } = stub({ afterPut: SERVICE });
    const r = await applyWlanChange({ ...base, changeId: 'wlan.ft', desired: true, fetchFn });

    expect(r.status).toBe('invalid');
    expect(r.error).toMatch(/not a change Cortex can make/i);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('coerces a numeric string rather than writing a string to the wire', async () => {
    const after = { ...SERVICE, preAuthenticatedIdleTimeout: 600 };
    const { fetchFn, calls } = stub({ afterPut: after });
    const r = await applyWlanChange({
      ...base,
      changeId: 'wlan.idleTimeout.preAuth',
      desired: '600',
      fetchFn,
    });

    expect(r.status).toBe('applied');
    expect(calls.find((c) => c.method === 'PUT').body.preAuthenticatedIdleTimeout).toBe(600);
  });
});
