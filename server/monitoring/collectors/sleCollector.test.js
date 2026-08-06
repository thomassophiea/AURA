import { describe, it, expect, vi } from 'vitest';

import { collectSle, groupApsBySite, normalizeSiteList, extractRows } from './sleCollector.js';
import { loadMonitoringConfig } from '../config.js';

const CONFIG = loadMonitoringConfig({ DATABASE_URL: 'postgres://localhost/aura' });
const NOW = new Date('2026-08-05T12:00:00.000Z');
const SOURCE = { id: 'src-1', orgId: 'org-1', siteGroupId: 'sg-1', capabilities: {} };

const ok = (data) => ({ ok: true, status: 200, data, errorClass: null, errorSummary: null });
const fail = (status, errorClass) => ({
  ok: false, status, data: null, errorClass, errorSummary: `${errorClass} failure`,
});

function fakeSession(routes) {
  return {
    get: vi.fn(async (path) => {
      const key = Object.keys(routes)
        .filter((p) => path.startsWith(p))
        .sort((a, b) => b.length - a.length)[0];
      return key ? routes[key] : fail(404, 'upstream_client_error');
    }),
  };
}

describe('extractRows', () => {
  it('accepts a bare array', () => {
    expect(extractRows([1, 2], ['aps'])).toEqual([1, 2]);
  });

  it('accepts an envelope', () => {
    expect(extractRows({ aps: [1] }, ['aps'])).toEqual([1]);
    expect(extractRows({ data: [2] }, ['aps'])).toEqual([2]);
  });

  it('returns an empty array for junk rather than throwing', () => {
    expect(extractRows('nope', ['aps'])).toEqual([]);
    expect(extractRows(null, ['aps'])).toEqual([]);
    expect(extractRows({ unexpected: true }, ['aps'])).toEqual([]);
  });
});

describe('normalizeSiteList', () => {
  it('reads id and name, tolerating both field spellings', () => {
    expect(normalizeSiteList([{ id: 's1', siteName: 'HQ' }, { siteId: 's2', name: 'Branch' }]))
      .toEqual([{ id: 's1', name: 'HQ' }, { id: 's2', name: 'Branch' }]);
  });

  it('drops rows with no identifier', () => {
    expect(normalizeSiteList([{ name: 'nameless' }])).toEqual([]);
  });
});

describe('groupApsBySite', () => {
  const sites = [
    { id: 'site-a', name: 'Production Site' },
    { id: 'site-b', name: 'LAB Remote Site' },
  ];

  it('groups by hostSite, which carries the site NAME not its id', () => {
    // AP rows from /v1/aps/query have no siteId field at all.
    const grouped = groupApsBySite(
      [
        { serialNumber: 'AP-1', hostSite: 'Production Site' },
        { serialNumber: 'AP-2', hostSite: 'LAB Remote Site' },
        { serialNumber: 'AP-3', hostSite: 'Production Site' },
      ],
      sites
    );
    expect(grouped.get('site-a').map((a) => a.serialNumber)).toEqual(['AP-1', 'AP-3']);
    expect(grouped.get('site-b').map((a) => a.serialNumber)).toEqual(['AP-2']);
  });

  it('matches case- and whitespace-insensitively', () => {
    const grouped = groupApsBySite([{ serialNumber: 'AP-1', hostSite: '  production site ' }], sites);
    expect(grouped.get('site-a')).toHaveLength(1);
  });

  it('leaves an AP out rather than guessing when hostSite matches nothing', () => {
    const grouped = groupApsBySite([{ serialNumber: 'AP-9', hostSite: 'Unknown Place' }], sites);
    expect(grouped.get('site-a')).toEqual([]);
    expect(grouped.get('site-b')).toEqual([]);
  });

  it('still returns an entry for a site with no APs', () => {
    const grouped = groupApsBySite([], sites);
    expect(grouped.get('site-a')).toEqual([]);
    expect(grouped.has('site-b')).toBe(true);
  });

  it('accepts a direct site id on controllers that supply one', () => {
    const grouped = groupApsBySite([{ serialNumber: 'AP-1', siteId: 'site-b' }], sites);
    expect(grouped.get('site-b')).toHaveLength(1);
  });

  it('tolerates AP rows with no site linkage at all', () => {
    const grouped = groupApsBySite([{ serialNumber: 'AP-1' }], sites);
    expect([...grouped.values()].flat()).toEqual([]);
  });
});

describe('collectSle', () => {
  const station = (n) => ({
    macAddress: `AA:BB:CC:00:00:0${n}`, isWired: false, rssi: -55,
    txRate: 1e8, rxRate: 1e8, authenticated: true, apSerialNumber: 'AP-1',
  });

  const routes = {
    '/v3/sites/site-a/stations': ok([station(1), station(2)]),
    '/v3/sites/site-b/stations': ok([]),
    '/v1/aps/query': ok([
      { serialNumber: 'AP-1', hostSite: 'Production Site', status: 'InService' },
      { serialNumber: 'AP-2', hostSite: 'Production Site', status: 'disconnected' },
    ]),
    '/v3/sites': ok([
      { id: 'site-a', siteName: 'Production Site' },
      { id: 'site-b', siteName: 'LAB Remote Site' },
    ]),
  };

  it('fetches APs once for the controller, not once per site', async () => {
    const session = fakeSession(routes);
    await collectSle({ session, source: SOURCE, config: CONFIG, now: NOW });
    const apCalls = session.get.mock.calls.filter(([p]) => p.startsWith('/v1/aps/query'));
    expect(apCalls).toHaveLength(1);
  });

  it('never calls a per-site AP endpoint (they all 404 on this controller)', async () => {
    const session = fakeSession(routes);
    await collectSle({ session, source: SOURCE, config: CONFIG, now: NOW });
    const perSite = session.get.mock.calls.filter(([p]) => /\/sites\/[^/]+\/(aps|accessPoints)/.test(p));
    expect(perSite).toEqual([]);
  });

  it('produces AP-based SLEs now that APs resolve', async () => {
    const session = fakeSession(routes);
    const { samples } = await collectSle({ session, source: SOURCE, config: CONFIG, now: NOW });
    const names = samples.filter((s) => s.siteId === 'site-a').map((s) => s.metricName);
    expect(names).toContain('ap_health');
    expect(names).toContain('capacity');
  });

  it('scores AP health from the APs belonging to that site', async () => {
    const session = fakeSession(routes);
    const { samples } = await collectSle({ session, source: SOURCE, config: CONFIG, now: NOW });
    const apHealth = samples.find((s) => s.siteId === 'site-a' && s.metricName === 'ap_health');
    // One of two APs is disconnected.
    expect(apHealth).toMatchObject({ numerator: 1, denominator: 2, numericValue: 50 });
  });

  it('reports no failure for a healthy collection', async () => {
    const session = fakeSession(routes);
    const result = await collectSle({ session, source: SOURCE, config: CONFIG, now: NOW });
    expect(result.partialFailures).toEqual([]);
    expect(result.fatal).toBeNull();
  });

  it('emits nothing for a site with no clients and no APs', async () => {
    const session = fakeSession(routes);
    const { samples } = await collectSle({ session, source: SOURCE, config: CONFIG, now: NOW });
    expect(samples.filter((s) => s.siteId === 'site-b')).toEqual([]);
  });

  it('treats an unreadable site as partial and keeps the others', async () => {
    const session = fakeSession({ ...routes, '/v3/sites/site-a/stations': fail(500, 'upstream_server_error') });
    const { samples, partialFailures } = await collectSle({ session, source: SOURCE, config: CONFIG, now: NOW });
    expect(partialFailures.some((f) => f.scope === 'site:site-a')).toBe(true);
    // AP-based SLEs for site-a still compute; client SLEs do not.
    expect(samples.some((s) => s.siteId === 'site-a' && s.metricName === 'ap_health')).toBe(true);
    expect(samples.some((s) => s.siteId === 'site-a' && s.metricName === 'coverage')).toBe(false);
  });

  it('records an AP-query failure once, not once per site', async () => {
    const session = fakeSession({ ...routes, '/v1/aps/query': fail(500, 'upstream_server_error') });
    const { partialFailures } = await collectSle({ session, source: SOURCE, config: CONFIG, now: NOW });
    expect(partialFailures.filter((f) => f.scope === 'aps')).toHaveLength(1);
  });

  it('is fatal only when the site list itself cannot be read', async () => {
    const session = fakeSession({ '/v3/sites': fail(null, 'network') });
    const result = await collectSle({ session, source: SOURCE, config: CONFIG, now: NOW });
    expect(result.fatal).toMatchObject({ errorClass: 'network' });
    expect(result.samples).toEqual([]);
  });

  it('writes no samples when the controller returns no sites', async () => {
    const session = fakeSession({ '/v3/sites': ok([]) });
    const result = await collectSle({ session, source: SOURCE, config: CONFIG, now: NOW });
    expect(result.samples).toEqual([]);
    expect(result.fatal).toBeNull();
  });
});
