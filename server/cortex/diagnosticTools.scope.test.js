/**
 * Scope binding in the tools.
 *
 * These cover the defect this work started from: `scope.siteName` was accepted
 * by `createDiagnosticTools` and reached no tool at all, so a site-scoped
 * question was answered fleet-wide silently — and when a site name DID reach
 * the filter, an exact-string comparison against a UI display label matched
 * nothing, and nothing was reported as "no problems here".
 */
import { describe, it, expect } from 'vitest';
import zlib from 'node:zlib';
import { createDiagnosticTools } from './diagnosticTools.js';
import { CapabilityRegistry } from './capabilityRegistry.js';

const frame = (obj) => [{ frame: zlib.deflateSync(Buffer.from(JSON.stringify(obj))).toString('base64') }];

/** Two sites: one healthy, one with a clear problem on a single AP. */
const MU = [
  // PrimarySite: four healthy clients.
  ...Array.from({ length: 4 }, (_, i) => ({
    MAC: `58:9A:3E:E8:1D:0${i}`,
    IP: `10.0.0.${i + 1}`,
    SSID: 'Skynet',
    ApName: 'AP-PRIMARY',
    ApSerial: 'CV012408S-C0102',
    SiteName: 'PrimarySite',
    RadioID: 1,
    Channel: '36',
    Rss: -50,
    SNR: 45,
    RFQI: 5,
    LastUpdate: 1789043162,
  })),
  // AURA_LAB: four clients on one AP with a bad signal.
  ...Array.from({ length: 4 }, (_, i) => ({
    MAC: `A6:E1:F9:FB:E3:0${i}`,
    IP: `10.0.1.${i + 1}`,
    SSID: 'Skynet',
    ApName: 'AP-LAB-BAD',
    ApSerial: 'WM012243W-30032',
    SiteName: 'AURA_LAB',
    RadioID: 1,
    Channel: '36',
    Rss: -88,
    SNR: 8,
    RFQI: 1,
    LastUpdate: 1789043162,
  })),
];

const APS = [
  { serialNumber: 'CV012408S-C0102', apName: 'AP-PRIMARY', status: 'InService', hostSite: 'PrimarySite' },
  { serialNumber: 'WM012243W-30032', apName: 'AP-LAB-BAD', status: 'InService', hostSite: 'AURA_LAB' },
];

const SITES = [{ siteName: 'PrimarySite' }, { siteName: 'AURA_LAB' }, { siteName: 'QuietSite' }];

function stubSession(overrides = {}) {
  return {
    baseUrl: 'https://gw.test',
    get: async (path) => {
      if (overrides[path] !== undefined) return overrides[path];
      if (path.startsWith('/v1/report/flex') && path.includes('MuTable')) {
        return { ok: true, status: 200, data: frame(MU) };
      }
      if (path.startsWith('/v1/report/flex')) return { ok: true, status: 200, data: frame([]) };
      if (path === '/v3/sites') return { ok: true, status: 200, data: SITES };
      if (path === '/v1/aps/query') return { ok: true, status: 200, data: APS };
      if (path === '/v1/services') return { ok: true, status: 200, data: [] };
      if (path === '/v1/topologies') return { ok: true, status: 200, data: [] };
      if (path === '/v3/profiles') return { ok: true, status: 200, data: [] };
      return { ok: false, status: 404, data: null, errorSummary: 'not found' };
    },
  };
}

const make = (scope = {}, overrides) =>
  createDiagnosticTools({
    session: stubSession(overrides),
    scope,
    capabilities: new CapabilityRegistry(),
  });

describe('getSiteOverview honours the resolved scope', () => {
  it('covers the whole estate when nothing is bound', async () => {
    const r = await make().getSiteOverview.handler({});
    expect(r.clientCount).toBe(8);
    expect(r.scopeApplied.level).toBe('fleet');
    expect(r.scope).toBe('all sites');
  });

  it('counts only the bound site — the headline defect', async () => {
    // Before scope binding this returned 8 and the answer presented an
    // estate-wide number as the site's own.
    const r = await make({ siteNames: ['AURA_LAB'] }).getSiteOverview.handler({});
    expect(r.clientCount).toBe(4);
    expect(r.scopeApplied).toMatchObject({ level: 'site', siteNames: ['AURA_LAB'] });
    expect(r.note).toMatch(/Every count here covers AURA_LAB/);
  });

  it('matches a site name whose punctuation and case differ', async () => {
    // src/App.tsx fills the UI site name from displayName || name || siteName,
    // so "Aura Lab" was compared against "AURA_LAB" and matched nothing.
    const r = await make({ siteNames: ['aura lab'] }).getSiteOverview.handler({});
    expect(r.status).not.toBe('scope_matched_nothing');
    expect(r.clientCount).toBe(4);
  });

  it('refuses to report zero when the site filter matches nothing', async () => {
    // The silent false-clean: zero rows became clientsWithFindings: 0 and was
    // reported as "no problems at that site".
    const r = await make({ siteNames: ['Beta North Campus (Building 4)'] }).getSiteOverview.handler({});
    expect(r.status).toBe('scope_matched_nothing');
    expect(r.clientCount).toBeUndefined();
    expect(r.instruction).toMatch(/not good news/i);
    expect(r.availableSites).toContain('PrimarySite');
    expect(r.availableSites).toContain('AURA_LAB');
  });

  it('lets an explicit model argument override the bound scope', async () => {
    const r = await make({ siteNames: ['AURA_LAB'] }).getSiteOverview.handler({
      siteName: 'PrimarySite',
    });
    expect(r.clientCount).toBe(4);
    expect(r.scopeApplied.siteNames).toEqual(['PrimarySite']);
  });

  it('scopes the AP status counts too, not just the clients', async () => {
    const r = await make({ siteNames: ['AURA_LAB'] }).getSiteOverview.handler({});
    const total = Object.values(r.apStatusCounts).reduce((a, b) => a + b, 0);
    expect(total).toBe(1);
  });
});

describe('listSites', () => {
  it('includes a configured site with no telemetry at all', async () => {
    // The whole reason this tool exists: a site with no clients is invisible to
    // any list derived from client rows, and it is the site most likely to be
    // entirely broken.
    const r = await make().listSites.handler({});
    const names = r.sites.map((s) => s.name.value ?? s.name);
    expect(names).toContain('QuietSite');
    expect(r.silentSites.map((s) => s.value ?? s)).toContain('QuietSite');
  });

  it('marks a site with no telemetry as unknown, never healthy', async () => {
    const r = await make().listSites.handler({});
    const quiet = r.sites.find((s) => (s.name.value ?? s.name) === 'QuietSite');
    expect(quiet.hasTelemetry).toBe(false);
    expect(quiet.healthBasis).toBe('unknown');
    expect(r.note).toMatch(/never as healthy/);
  });

  it('says so when the configured list could not be read', async () => {
    const r = await make({}, { '/v3/sites': { ok: false, status: 500, errorSummary: 'boom' } })
      .listSites.handler({});
    expect(r.configuredListAvailable).toBe(false);
    expect(r.note).toMatch(/may be missing entirely/);
  });
});

describe('correlateProblem', () => {
  it('finds the AP that bounds the failure rather than describing one client', async () => {
    const r = await make().correlateProblem.handler({});
    expect(r.affectedCount).toBe(4);
    expect(r.populationCount).toBe(8);
    expect(r.blastRadius.verdict).toBe('boundary_found');
    expect(r.headline).toMatch(/4 of 8 clients affected/);
  });

  it('names what separates the broken population from the working one', async () => {
    const r = await make().correlateProblem.handler({});
    expect(r.counterfactual.comparable).toBe(true);
    expect(r.counterfactual.differences.length).toBeGreaterThan(0);
  });

  it('refuses a verdict when the site filter matches nothing', async () => {
    const r = await make({ siteNames: ['Nowhere'] }).correlateProblem.handler({});
    expect(r.status).toBe('scope_matched_nothing');
  });
});

describe('reconcileConfiguration', () => {
  const SERVICES = [
    { id: 'svc-1', ssid: 'Staff', enabled: true, defaultTopology: 'topo-1' },
    { id: 'svc-2', ssid: 'Dangling', enabled: true, defaultTopology: 'gone' },
  ];
  const TOPOLOGIES = [{ id: 'topo-1', name: 'Staff', vlanid: 30 }];
  const cfg = (extra = {}) => ({
    '/v1/services': { ok: true, status: 200, data: SERVICES },
    '/v1/topologies': { ok: true, status: 200, data: TOPOLOGIES },
    ...extra,
  });

  it('reports an SSID that does not exist rather than inventing one', async () => {
    const r = await make({}, cfg()).reconcileConfiguration.handler({ ssid: 'Nope' });
    expect(r.status).toBe('not_found');
    expect(r.knownSsids.map((s) => s.value ?? s)).toContain('Staff');
  });

  it('refuses to resolve when several WLANs share one SSID', async () => {
    const r = await make(
      {},
      cfg({
        '/v1/services': {
          ok: true,
          status: 200,
          data: [
            { id: 'a', ssid: 'Staff', defaultTopology: 'topo-1' },
            { id: 'b', ssid: 'Staff', defaultTopology: 'topo-1' },
          ],
        },
      })
    ).reconcileConfiguration.handler({ ssid: 'Staff' });
    expect(r.status).toBe('ambiguous');
    expect(r.reason).toMatch(/A WLAN is a configuration object and an SSID is a broadcast name/);
  });

  it('catches a dangling topology', async () => {
    const r = await make({}, cfg()).reconcileConfiguration.handler({ ssid: 'Dangling' });
    expect(r.verdict).toBe('not_applied');
    expect(r.rows[0].detail).toMatch(/nowhere to go/);
  });

  it('records that no expectation was supplied rather than inventing one', async () => {
    const r = await make({}, cfg()).reconcileConfiguration.handler({ ssid: 'Staff' });
    expect(r.hasExpectation).toBe(false);
    expect(r.expectedSource).toBeNull();
  });

  it('uses an explicit VLAN as the expectation and finds the drift', async () => {
    const r = await make({}, cfg()).reconcileConfiguration.handler({
      ssid: 'Staff',
      expectedVlan: 40,
    });
    expect(r.hasExpectation).toBe(true);
    const vlanRow = r.rows.find((x) => x.attribute === 'vlan');
    expect(vlanRow.verdict).toBe('config_drift');
  });

  it('lists the attributes that cannot be verified operationally', async () => {
    const r = await make({}, cfg()).reconcileConfiguration.handler({ ssid: 'Staff' });
    expect(r.unverifiable).toContain('radioIndices');
    expect(r.note).toMatch(/cannot be proven to have landed/);
  });
});
