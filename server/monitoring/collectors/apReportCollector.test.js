import { describe, it, expect } from 'vitest';

import { normalizeApList, buildSiteNameToIdMap } from './apReportCollector.js';

describe('normalizeApList', () => {
  it('extracts hostSite as the site name when no id is present', () => {
    const aps = normalizeApList([
      { serialNumber: 'AP-1', hostSite: 'PrimarySite' },
      { serialNumber: 'AP-2', siteId: 'uuid-2' },
    ]);
    expect(aps).toEqual([
      { serial: 'AP-1', siteId: null, hostSite: 'PrimarySite' },
      { serial: 'AP-2', siteId: 'uuid-2', hostSite: null },
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
