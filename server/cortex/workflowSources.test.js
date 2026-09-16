import { describe, it, expect } from 'vitest';

import { buildWorkflowSources } from './workflowSources.js';

/** A session stub shaped like RequestScopedSession's `get` envelope. */
function sessionReturning(map) {
  return {
    get: async (path) => {
      const entry = map[path];
      if (!entry) return { ok: false, status: 404, errorSummary: 'not found' };
      if (entry instanceof Error) {
        return { ok: false, status: 500, errorSummary: entry.message };
      }
      return { ok: true, status: 200, data: entry };
    },
  };
}

describe('listSites', () => {
  it('normalises siteName across both spellings', async () => {
    const sources = buildWorkflowSources(
      sessionReturning({ '/v3/sites': [{ id: '1', siteName: 'PrimarySite' }, { id: '2', name: 'Branch' }] })
    );
    const sites = await sources.listSites();
    expect(sites.map((s) => s.siteName)).toEqual(['PrimarySite', 'Branch']);
  });

  it('unwraps a wrapped collection', async () => {
    const sources = buildWorkflowSources(
      sessionReturning({ '/v3/sites': { sites: [{ siteName: 'Only' }] } })
    );
    expect(await sources.listSites()).toHaveLength(1);
  });
});

describe('listAps — hostSite is the join', () => {
  const aps = {
    '/v1/aps/query': [
      { serialNumber: 'AP1', hostSite: 'PrimarySite' },
      { serialNumber: 'AP2', hostSite: 'primarysite' },
      { serialNumber: 'AP3', hostSite: 'Branch' },
      // Neither siteId nor siteName is present on real rows; this one carries
      // siteName only, which is tolerated as a secondary match.
      { serialNumber: 'AP4', siteName: 'PrimarySite' },
    ],
  };

  it('matches on hostSite, case-insensitively', async () => {
    const sources = buildWorkflowSources(sessionReturning(aps));
    const found = await sources.listAps('PrimarySite');
    expect(found.map((a) => a.serialNumber)).toEqual(['AP1', 'AP2', 'AP4']);
  });

  it('returns a genuine empty list for a site with no APs', async () => {
    const sources = buildWorkflowSources(sessionReturning(aps));
    expect(await sources.listAps('Nowhere')).toEqual([]);
  });

  it('returns everything when no site is given', async () => {
    const sources = buildWorkflowSources(sessionReturning(aps));
    expect(await sources.listAps()).toHaveLength(4);
  });
});

describe('listTopologies', () => {
  it('keeps Gateway-wide topologies as candidates for any site', async () => {
    const sources = buildWorkflowSources(
      sessionReturning({
        '/v1/topologies': [
          { name: 'Guest VLAN', vlanid: 30 },
          { name: 'BranchOnly', vlanid: 40, siteName: 'Branch' },
        ],
      })
    );
    const found = await sources.listTopologies('PrimarySite');
    expect(found.map((t) => t.name)).toEqual(['Guest VLAN']);
  });
});

describe('a failed read THROWS rather than returning empty', () => {
  // This is the whole contract. An empty array means "the Gateway answered, and
  // the answer was none"; a throw means "we could not find out". Collapsing the
  // second into the first turns an unreachable Gateway into a confident, wrong
  // statement about the customer's network.
  it('throws on a site read failure', async () => {
    const sources = buildWorkflowSources(
      sessionReturning({ '/v3/sites': new Error('HTTP 500 reporting service') })
    );
    await expect(sources.listSites()).rejects.toThrow(/500/);
  });

  it('throws on an AP read failure', async () => {
    const sources = buildWorkflowSources(
      sessionReturning({ '/v1/aps/query': new Error('gateway unreachable') })
    );
    await expect(sources.listAps('PrimarySite')).rejects.toThrow(/unreachable/);
  });

  it('throws when the route is missing entirely', async () => {
    const sources = buildWorkflowSources(sessionReturning({}));
    await expect(sources.listTopologies()).rejects.toThrow();
  });
});

describe('no session', () => {
  it('yields no sources rather than throwing at construction', () => {
    expect(buildWorkflowSources(null)).toEqual({});
  });
});
