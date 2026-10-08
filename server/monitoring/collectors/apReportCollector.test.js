import { describe, it, expect } from 'vitest';

import { normalizeApList, buildSiteNameToIdMap } from './apReportCollector.js';

describe('normalizeApList', () => {
  it('extracts hostSite as the site name when no id is present', () => {
    const aps = normalizeApList([
      { serialNumber: 'AP-1', hostSite: 'PrimarySite' },
      { serialNumber: 'AP-2', siteId: 'uuid-2' },
    ]);
    expect(aps).toEqual([
      { serial: 'AP-1', siteId: null, hostSite: 'PrimarySite', status: null },
      { serial: 'AP-2', siteId: 'uuid-2', hostSite: null, status: null },
    ]);
  });

  it('drops rows without a serial', () => {
    expect(normalizeApList([{ hostSite: 'X' }])).toEqual([]);
  });
});

describe('buildSiteNameToIdMap', () => {
  it('maps site name to id from the site list', () => {
    const map = buildSiteNameToIdMap([
      { id: '84b3642f', name: 'PrimarySite' },
      { id: 'f85c4ebb', name: 'AFC LAB' },
      { id: null, name: 'ignored' },
    ]);
    expect(map.get('PrimarySite')).toBe('84b3642f');
    expect(map.get('AFC LAB')).toBe('f85c4ebb');
    expect(map.has('ignored')).toBe(false);
  });

  it('returns an empty map for an empty list', () => {
    expect(buildSiteNameToIdMap([]).size).toBe(0);
  });
});

describe('collectApReports — Gateway load', () => {
  const ok = (data) => ({ ok: true, status: 200, data, errorClass: null, errorSummary: null });
  const config = { retentionDays: 7, reportTimeoutSeconds: 45 };
  const source = { id: 'src', capabilities: { durations: { '3H': true } } };

  it('skips APs that are not in service and uses the long report budget', async () => {
    const { collectApReports } = await import('./apReportCollector.js');
    const calls = [];
    const session = {
      get: async (path, opts) => {
        calls.push([path, opts]);
        if (path === '/v1/aps/query') {
          return ok([
            { serialNumber: 'UP', hostSite: 'HQ', status: 'InService' },
            { serialNumber: 'DOWN', hostSite: 'HQ', status: 'critical' },
          ]);
        }
        if (path === '/v3/sites') return ok([{ id: 's1', name: 'HQ' }]);
        return ok({});
      },
    };
    const result = await collectApReports({ session, source, config, now: new Date() });
    const reports = calls.filter(([p]) => p.startsWith('/v1/report/aps/'));
    expect(reports.map(([p]) => p.split('?')[0])).toEqual(['/v1/report/aps/UP']);
    expect(reports[0][1]).toEqual({ timeoutMs: 45_000 });
    expect(result.notes.join(' ')).toMatch(/1 AP\(s\) not in service skipped/);
  });
});
