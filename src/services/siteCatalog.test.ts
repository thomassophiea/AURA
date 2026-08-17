import { describe, it, expect } from 'vitest';

import {
  buildOs1Catalog,
  buildStagingSite,
  buildXiqCatalog,
  buildXiqDefaultSiteValue,
  compareCatalogSites,
  deriveGatewayMode,
  flattenOs1Catalog,
  flattenXiqCatalog,
  gatewayIdentity,
  gatewayModeLabel,
  getDeviceSiteValue,
  isGatewayUnassigned,
  isSystemSiteKey,
  pinSystemSitesLast,
  resolveOs1DeviceSiteKey,
  resolveOs1SiteLabel,
  sortCatalogSites,
} from './siteCatalog';
import {
  GATEWAY_UNASSIGNED_VALUE,
  OS1_STAGING_KEY,
  OS1_STAGING_LABEL,
  SYSTEM_SITE_SORT_PRIORITY,
  XIQ_DEFAULT_SITE_LABEL,
  type CatalogSite,
} from '../types/siteCatalog';
import type { SiteGroup } from '../types/domain';
import type { Site } from './api';

// ── Fixtures ───────────────────────────────────────────────────────────────

function siteGroup(overrides: Partial<SiteGroup> & { id: string; name: string }): SiteGroup {
  return {
    org_id: 'org-1',
    controller_url: 'https://gw.example.test:443',
    connection_status: 'connected',
    is_default: false,
    ...overrides,
  };
}

function site(overrides: Partial<Site> & { id: string; name: string }): Site {
  return { ...overrides } as Site;
}

// ── Gateway "Unassigned" → OS1 "Staging" ───────────────────────────────────

describe('isGatewayUnassigned', () => {
  it('recognises every way the Gateway expresses "no Site"', () => {
    expect(isGatewayUnassigned('Unassigned')).toBe(true);
    expect(isGatewayUnassigned('unassigned')).toBe(true);
    expect(isGatewayUnassigned('UNASSIGNED')).toBe(true);
    expect(isGatewayUnassigned('  Unassigned  ')).toBe(true);
    expect(isGatewayUnassigned('')).toBe(true);
    expect(isGatewayUnassigned('   ')).toBe(true);
    expect(isGatewayUnassigned(null)).toBe(true);
    expect(isGatewayUnassigned(undefined)).toBe(true);
  });

  it('does not mistake a real site for the unassigned state', () => {
    expect(isGatewayUnassigned('PrimarySite')).toBe(false);
    expect(isGatewayUnassigned('AFC LAB')).toBe(false);
    // A site an operator happened to name similarly is still a real site.
    expect(isGatewayUnassigned('Unassigned Overflow')).toBe(false);
  });
});

describe('device site resolution', () => {
  it('reads the most specific site field a device carries', () => {
    expect(getDeviceSiteValue({ hostSite: 'PrimarySite', siteName: 'Ignored' })).toBe('PrimarySite');
    expect(getDeviceSiteValue({ siteName: 'AFC LAB' })).toBe('AFC LAB');
    expect(getDeviceSiteValue({ hostSite: '  Padded  ' })).toBe('Padded');
  });

  it('returns empty for a device with no site fields at all', () => {
    expect(getDeviceSiteValue({})).toBe('');
    expect(getDeviceSiteValue(null)).toBe('');
    expect(getDeviceSiteValue(undefined)).toBe('');
  });

  it('maps an unassigned device onto the Staging key, not a blank', () => {
    expect(resolveOs1DeviceSiteKey({ hostSite: 'Unassigned' })).toBe(OS1_STAGING_KEY);
    expect(resolveOs1DeviceSiteKey({})).toBe(OS1_STAGING_KEY);
    expect(resolveOs1DeviceSiteKey({ hostSite: 'PrimarySite' })).toBe('PrimarySite');
  });

  it('never shows the Gateway word "Unassigned" to an OS1 user', () => {
    expect(resolveOs1SiteLabel({ hostSite: 'Unassigned' })).toBe(OS1_STAGING_LABEL);
    expect(resolveOs1SiteLabel({})).toBe(OS1_STAGING_LABEL);
    expect(resolveOs1SiteLabel({ hostSite: 'AFC LAB' })).toBe('AFC LAB');
  });
});

describe('isSystemSiteKey', () => {
  it('identifies both system sites and nothing else', () => {
    expect(isSystemSiteKey(OS1_STAGING_KEY)).toBe(true);
    expect(isSystemSiteKey(buildXiqDefaultSiteValue('sg-1'))).toBe(true);
    expect(isSystemSiteKey('PrimarySite')).toBe(false);
    expect(isSystemSiteKey('xiq:sg-1:4207')).toBe(false);
    expect(isSystemSiteKey('all')).toBe(false);
    expect(isSystemSiteKey(null)).toBe(false);
  });
});

// ── Ordering ───────────────────────────────────────────────────────────────

describe('system site ordering', () => {
  /** Names chosen to sit either side of "Staging" alphabetically. */
  const normal = (name: string): CatalogSite => ({
    key: name,
    id: name,
    name,
    source: 'os1',
    sortPriority: 0,
    siteGroupId: 'sg-1',
    siteGroupName: 'Warehouses',
    deviceCount: 0,
  });

  it('puts Staging last even against names that sort after it', () => {
    const sorted = sortCatalogSites([normal('zzz Warehouse'), buildStagingSite(0), normal('AAA Depot')]);
    expect(sorted.map((s) => s.name)).toEqual(['AAA Depot', 'zzz Warehouse', OS1_STAGING_LABEL]);
  });

  it('keeps Staging last under a DESCENDING name sort', () => {
    // The trap: negating a comparator that already compared priority would
    // float Staging to the top. pinSystemSitesLast must wrap the flipped
    // comparator, which is what a caller sorting descending has to do.
    const byNameDesc = (a: CatalogSite, b: CatalogSite) => -a.name.localeCompare(b.name);
    const sorted = [normal('AAA Depot'), buildStagingSite(0), normal('zzz Warehouse')].sort(
      pinSystemSitesLast(byNameDesc)
    );
    expect(sorted.map((s) => s.name)).toEqual(['zzz Warehouse', 'AAA Depot', OS1_STAGING_LABEL]);
  });

  it('treats a missing sortPriority as a normal site', () => {
    const untagged = { name: 'Legacy row' } as CatalogSite;
    const sorted = [buildStagingSite(0), untagged].sort(pinSystemSitesLast((a, b) => a.name.localeCompare(b.name)));
    expect(sorted.map((s) => s.name)).toEqual(['Legacy row', OS1_STAGING_LABEL]);
  });

  it('orders names naturally rather than lexically', () => {
    const sorted = sortCatalogSites([normal('Site 10'), normal('Site 2')]);
    expect(sorted.map((s) => s.name)).toEqual(['Site 2', 'Site 10']);
  });

  it('compareCatalogSites is stable for two system sites', () => {
    expect(compareCatalogSites(buildStagingSite(0), buildStagingSite(3))).toBe(0);
  });
});

// ── Gateway boundary ───────────────────────────────────────────────────────

describe('Gateway boundary', () => {
  it('is a pair only when a second Gateway backs it', () => {
    expect(deriveGatewayMode({ secondary_controller: 'gw-b.example.test' })).toBe('paired');
    expect(deriveGatewayMode({ secondary_controller: '   ' })).toBe('standalone');
    expect(deriveGatewayMode({ secondary_controller: undefined })).toBe('standalone');
  });

  it('labels the boundary in Gateway vocabulary', () => {
    expect(gatewayModeLabel('paired')).toBe('Gateway Pair');
    expect(gatewayModeLabel('standalone')).toBe('Standalone');
  });
});

// ── OS1 catalog ────────────────────────────────────────────────────────────

describe('buildOs1Catalog', () => {
  const groups = [
    siteGroup({ id: 'sg-1', name: 'Warehouses', is_default: true, locking_id: '2624E-C7BE5' }),
    siteGroup({ id: 'sg-2', name: 'Retail', secondary_controller: 'gw-b', locking_id: '2110E-C42CF' }),
  ];

  it('nests each Site under the Gateway boundary that owns it', () => {
    const catalog = buildOs1Catalog({
      siteGroups: groups,
      sites: [
        site({ id: 's1', name: 'PrimarySite', site_group_id: 'sg-1' }),
        site({ id: 's2', name: 'Store 014', site_group_id: 'sg-2' }),
        site({ id: 's3', name: 'AFC LAB', site_group_id: 'sg-1' }),
      ],
    });

    expect(catalog.groups.map((g) => g.name)).toEqual(['Warehouses', 'Retail']);
    expect(catalog.groups[0].sites.map((s) => s.name)).toEqual(['AFC LAB', 'PrimarySite']);
    expect(catalog.groups[1].sites.map((s) => s.name)).toEqual(['Store 014']);
  });

  it('carries the Gateway identity onto each boundary', () => {
    const catalog = buildOs1Catalog({ siteGroups: groups, sites: [] });
    expect(catalog.groups[0]).toMatchObject({ lockingId: '2624E-C7BE5', gatewayMode: 'standalone' });
    expect(catalog.groups[1]).toMatchObject({ lockingId: '2110E-C42CF', gatewayMode: 'paired' });
  });

  it('attributes an untagged Site to the default Gateway rather than dropping it', () => {
    const catalog = buildOs1Catalog({
      siteGroups: groups,
      sites: [site({ id: 's1', name: 'CLONE' })],
    });
    expect(catalog.groups[0].sites.map((s) => s.name)).toEqual(['CLONE']);
    expect(catalog.groups[0].sites[0].siteGroupName).toBe('Warehouses');
  });

  it('still surfaces a Site whose Gateway is unknown and undeducible', () => {
    const catalog = buildOs1Catalog({
      siteGroups: groups, // two groups, none default-resolvable for an unknown id
      sites: [site({ id: 's9', name: 'Mystery', site_group_id: 'sg-missing' })],
    });
    const names = flattenOs1Catalog(catalog).map((s) => s.name);
    expect(names).toContain('Mystery');
  });

  it('always includes Staging, and puts it last overall', () => {
    const catalog = buildOs1Catalog({
      siteGroups: groups,
      sites: [site({ id: 's1', name: 'zzz Depot', site_group_id: 'sg-2' })],
    });
    const ordered = flattenOs1Catalog(catalog);
    expect(ordered.at(-1)?.name).toBe(OS1_STAGING_LABEL);
    expect(ordered.at(-1)?.systemKind).toBe('staging');
  });

  it('shows Staging when there are no OS1 sites at all', () => {
    const catalog = buildOs1Catalog({ siteGroups: groups, sites: [] });
    expect(flattenOs1Catalog(catalog).map((s) => s.name)).toEqual([OS1_STAGING_LABEL]);
  });

  it('shows Staging with zero devices without treating it as unknown', () => {
    const catalog = buildOs1Catalog({ siteGroups: groups, sites: [], unassignedDeviceCount: 0 });
    expect(catalog.staging.deviceCount).toBe(0);
  });

  it('leaves the device count null while it is genuinely unknown', () => {
    expect(buildOs1Catalog({ siteGroups: groups, sites: [] }).staging.deviceCount).toBeNull();
  });

  it('preserves the raw Gateway value behind the Staging label', () => {
    const staging = buildOs1Catalog({ siteGroups: groups, sites: [] }).staging;
    expect(staging.name).toBe(OS1_STAGING_LABEL);
    expect(staging.sourceValue).toBe(GATEWAY_UNASSIGNED_VALUE);
    expect(staging.sortPriority).toBe(SYSTEM_SITE_SORT_PRIORITY);
  });

  it('keys sites by name or id to match the consuming page', () => {
    const byName = buildOs1Catalog({
      siteGroups: groups,
      sites: [site({ id: 's1', name: 'PrimarySite', site_group_id: 'sg-1' })],
    });
    expect(byName.groups[0].sites[0].key).toBe('PrimarySite');

    const byId = buildOs1Catalog({
      siteGroups: groups,
      sites: [site({ id: 's1', name: 'PrimarySite', site_group_id: 'sg-1' })],
      osSiteValue: 'id',
    });
    expect(byId.groups[0].sites[0].key).toBe('s1');
  });

  it('reads a device count from whichever field the Gateway populated', () => {
    const catalog = buildOs1Catalog({
      siteGroups: groups,
      sites: [
        site({ id: 's1', name: 'A', site_group_id: 'sg-1', aps: 4 }),
        site({ id: 's2', name: 'B', site_group_id: 'sg-1', activeAPs: 2 }),
        site({ id: 's3', name: 'C', site_group_id: 'sg-1' }),
      ],
    });
    expect(catalog.groups[0].sites.map((s) => s.deviceCount)).toEqual([4, 2, null]);
  });

  it('falls back to the sole Gateway when there is exactly one', () => {
    const catalog = buildOs1Catalog({
      siteGroups: [siteGroup({ id: 'only', name: 'Lab' })],
      sites: [site({ id: 's1', name: 'PrimarySite' })],
    });
    expect(catalog.groups[0].sites[0].siteGroupId).toBe('only');
  });
});

// ── XIQ catalog ────────────────────────────────────────────────────────────

describe('buildXiqCatalog', () => {
  it('puts Default Site last even against a name that sorts after it', () => {
    const catalog = buildXiqCatalog({
      xiqSites: [
        { id: '9', name: 'zzz Campus', siteGroupId: 'sg-1' },
        { id: '1', name: 'AAA Campus', siteGroupId: 'sg-1' },
      ],
    });
    expect(flattenXiqCatalog(catalog).map((s) => s.name)).toEqual([
      'AAA Campus',
      'zzz Campus',
      XIQ_DEFAULT_SITE_LABEL,
    ]);
  });

  it('offers Default Site with zero devices when XIQ has no sites yet', () => {
    const catalog = buildXiqCatalog({ xiqSites: [], siteGroupId: 'sg-1' });
    expect(catalog.sites).toEqual([]);
    expect(catalog.defaultSite?.name).toBe(XIQ_DEFAULT_SITE_LABEL);
    expect(catalog.defaultSite?.deviceCount).toBe(0);
  });

  it('has no Default Site when no Site Group owns an XIQ session', () => {
    expect(buildXiqCatalog({ xiqSites: [] }).defaultSite).toBeNull();
  });

  it('encodes Default Site inside the existing xiq selector-value scheme', () => {
    expect(buildXiqDefaultSiteValue('sg-1')).toBe('xiq:sg-1:__default__');
    expect(buildXiqCatalog({ xiqSites: [], siteGroupId: 'sg-1' }).defaultSite?.key).toBe(
      'xiq:sg-1:__default__'
    );
  });

  it('keeps real XIQ sites on the existing value scheme', () => {
    const catalog = buildXiqCatalog({ xiqSites: [{ id: '4207', name: 'North', siteGroupId: 'sg-1' }] });
    expect(catalog.sites[0].key).toBe('xiq:sg-1:4207');
    expect(catalog.sites[0].systemKind).toBeUndefined();
  });
});

// ── Gateway identity ───────────────────────────────────────────────────────

describe('gatewayIdentity', () => {
  it('prefers the Locking ID, the stable license identity', () => {
    expect(
      gatewayIdentity({
        locking_id: '2624E-C7BE5',
        hostname: 'gw-a',
        controller_url: 'https://gw.example.test:443',
      })
    ).toBe('2624E-C7BE5');
  });

  it('falls back to the host name before the URL', () => {
    expect(
      gatewayIdentity({ locking_id: '  ', hostname: 'gw-a', controller_url: 'https://x.test:443' })
    ).toBe('gw-a');
  });

  it('falls back to the Gateway URL host — the org-scope case, where no identity is cached', () => {
    expect(gatewayIdentity({ controller_url: 'https://tsophiea.ddns.net:443' })).toBe(
      'tsophiea.ddns.net'
    );
  });

  it('still extracts a host from an unparseable URL rather than showing nothing', () => {
    expect(gatewayIdentity({ controller_url: '192.168.100.12:5825' })).toBe('192.168.100.12');
  });

  it('is null only when there is genuinely nothing to name', () => {
    expect(gatewayIdentity({})).toBeNull();
    expect(gatewayIdentity({ controller_url: '' })).toBeNull();
  });

  it('is carried onto every Site Group the catalog builds', () => {
    const catalog = buildOs1Catalog({
      siteGroups: [siteGroup({ id: 'sg-1', name: 'SouthEast', controller_url: 'https://gw.test:443' })],
      sites: [],
    });
    expect(catalog.groups[0].gatewayIdentity).toBe('gw.test');
  });
});
