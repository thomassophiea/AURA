import { describe, it, expect, vi } from 'vitest';

import { collectSiteReports, sitesWithAps } from './siteReportCollector.js';
import { ScopeBreaker } from '../scopeBreaker.js';

const ok = (data) => ({ ok: true, status: 200, data, errorClass: null, errorSummary: null });
const fail = (status, errorClass) => ({ ok: false, status, data: null, errorClass, errorSummary: errorClass });

const SOURCE = { id: 'src', capabilities: { durations: { '3H': true } } };
const CONFIG = { retentionDays: 7, reportTimeoutSeconds: 45 };
const NOW = new Date('2026-10-08T12:00:00Z');

function session(routes) {
  return {
    get: vi.fn(async (path) => {
      const key = Object.keys(routes)
        .filter((p) => path.startsWith(p))
        .sort((a, b) => b.length - a.length)[0];
      return key ? routes[key] : fail(404, 'upstream_client_error');
    }),
  };
}

const SITES = [
  { id: 's1', siteName: 'HQ' },
  { id: 's2', siteName: 'Empty' },
];

describe('sitesWithAps', () => {
  it('collects the hostSite names of every AP', () => {
    expect([...sitesWithAps([{ hostSite: 'HQ' }, { hostSite: 'HQ' }, { hostSite: 'B' }])]).toEqual([
      'HQ',
      'B',
    ]);
  });
});

describe('collectSiteReports', () => {
  it('does not ask the Gateway for a venue report on a site with no APs', async () => {
    const s = session({
      '/v3/sites/s1/report/venue': ok({}),
      '/v3/sites/s2/report/venue': ok({}),
      '/v1/aps/query': ok([{ serialNumber: 'A', hostSite: 'HQ' }]),
      '/v3/sites': ok(SITES),
    });
    const result = await collectSiteReports({ session: s, source: SOURCE, config: CONFIG, now: NOW });
    const asked = s.get.mock.calls.map(([p]) => p);
    expect(asked.some((p) => p.startsWith('/v3/sites/s1/report/venue'))).toBe(true);
    expect(asked.some((p) => p.startsWith('/v3/sites/s2/report/venue'))).toBe(false);
    expect(result.notes.join(' ')).toMatch(/1 site\(s\) without APs skipped/);
  });

  it('collects every site when the AP query fails, rather than guessing', async () => {
    const s = session({
      '/v3/sites/s1/report/venue': ok({}),
      '/v3/sites/s2/report/venue': ok({}),
      '/v1/aps/query': fail(500, 'upstream_server_error'),
      '/v3/sites': ok(SITES),
    });
    await collectSiteReports({ session: s, source: SOURCE, config: CONFIG, now: NOW });
    const venue = s.get.mock.calls.filter(([p]) => p.includes('/report/venue'));
    expect(venue).toHaveLength(2);
  });

  it('gives report requests the long report budget, not the default', async () => {
    const s = session({
      '/v3/sites/s1/report/venue': ok({}),
      '/v1/aps/query': ok([{ hostSite: 'HQ' }]),
      '/v3/sites': ok([SITES[0]]),
    });
    await collectSiteReports({ session: s, source: SOURCE, config: CONFIG, now: NOW });
    const call = s.get.mock.calls.find(([p]) => p.includes('/report/venue'));
    expect(call[1]).toEqual({ timeoutMs: 45_000 });
  });

  it('stops re-asking a site that keeps failing until its cool-down passes', async () => {
    const breaker = new ScopeBreaker({ random: () => 1 });
    const routes = {
      '/v3/sites/s1/report/venue': fail(500, 'upstream_server_error'),
      '/v1/aps/query': ok([{ hostSite: 'HQ' }]),
      '/v3/sites': ok([SITES[0]]),
    };
    const first = session(routes);
    const r1 = await collectSiteReports({ session: first, source: SOURCE, config: CONFIG, now: NOW, breaker });
    expect(r1.partialFailures).toHaveLength(1);

    const second = session(routes);
    const later = new Date(NOW.getTime() + 60_000);
    const r2 = await collectSiteReports({ session: second, source: SOURCE, config: CONFIG, now: later, breaker });
    expect(second.get.mock.calls.some(([p]) => p.includes('/report/venue'))).toBe(false);
    expect(r2.partialFailures).toHaveLength(0);
    expect(r2.notes.join(' ')).toMatch(/cooling down/);

    const third = session({ ...routes, '/v3/sites/s1/report/venue': ok({}) });
    const afterWindow = new Date(NOW.getTime() + 301_000);
    await collectSiteReports({ session: third, source: SOURCE, config: CONFIG, now: afterWindow, breaker });
    expect(third.get.mock.calls.some(([p]) => p.includes('/report/venue'))).toBe(true);
    expect(breaker.isOpen('src:site_report:s1', afterWindow.getTime() + 1)).toBe(false);
  });
});
