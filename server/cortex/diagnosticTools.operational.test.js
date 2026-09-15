/**
 * The two operational-insight tools, at the handler boundary.
 *
 * What these guard is the failure the operator caught: AURA's Service Levels
 * page showed PrimarySite at 94.5% with Coverage 70.6% over 34 clients, and
 * Cortex — in the same minute, on the same platform — reported that none of the
 * seven sites had any telemetry at all. Neither read was dishonest. The
 * investigation simply could not see the correlated insight the product already
 * held, and nothing made the disagreement visible.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import zlib from 'node:zlib';

const frame = (obj) => [
  { frame: zlib.deflateSync(Buffer.from(JSON.stringify(obj))).toString('base64') },
];

const serviceLevels = vi.fn();
const infrastructureAlerts = vi.fn();
const infrastructureAnalytics = vi.fn();
const resolveSourceIds = vi.fn();

vi.mock('./operationalEvidence.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    serviceLevels: (...a) => serviceLevels(...a),
    infrastructureAlerts: (...a) => infrastructureAlerts(...a),
    infrastructureAnalytics: (...a) => infrastructureAnalytics(...a),
  };
});

vi.mock('./historyEvidence.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, resolveSourceIds: (...a) => resolveSourceIds(...a) };
});

const { createDiagnosticTools } = await import('./diagnosticTools.js');
const { CapabilityRegistry } = await import('./capabilityRegistry.js');

/** Four live clients at PrimarySite, none anywhere else. */
const MU = Array.from({ length: 4 }, (_, i) => ({
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
}));

const SITES = [
  { id: 'site-primary', siteName: 'PrimarySite' },
  { id: 'site-afc', siteName: 'AFC LAB' },
];

function stubSession({ mu = MU } = {}) {
  return {
    baseUrl: 'https://gw.test',
    get: async (path) => {
      if (path.startsWith('/v1/report/flex') && path.includes('MuTable')) {
        return { ok: true, status: 200, data: frame(mu) };
      }
      if (path.startsWith('/v1/report/flex')) return { ok: true, status: 200, data: frame([]) };
      if (path === '/v3/sites') return { ok: true, status: 200, data: SITES };
      if (path === '/v1/aps/query') return { ok: true, status: 200, data: [] };
      return { ok: false, status: 404, data: null, errorSummary: 'not found' };
    },
  };
}

const make = (scope = {}, sessionOpts) =>
  createDiagnosticTools({
    session: stubSession(sessionOpts),
    scope,
    capabilities: new CapabilityRegistry(),
  });

/** The shape `serviceLevels()` returns for one scored site. */
function sleSite(siteId, overall, weakest, measuredOver = 34) {
  return {
    siteId,
    overall,
    overallStatus: overall >= 95 ? 'good' : overall >= 80 ? 'warn' : 'poor',
    weakestMetric: weakest,
    metrics: [
      {
        metricName: 'coverage',
        label: 'Coverage',
        successRate: weakest?.successRate ?? 100,
        sampleBasis: measuredOver,
        unit: '%',
        ageSeconds: 60,
      },
    ],
    metricsMeasured: ['coverage'],
    metricsNotMeasured: ['throughput', 'capacity', 'roaming', 'ap_health'],
    freshestSampleAgeSeconds: 60,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveSourceIds.mockResolvedValue({ ok: true, sourceIds: ['src-1'], sources: [], error: null });
});

describe('getServiceLevels — orientation', () => {
  it('joins stored site ids to names and reports worst first', async () => {
    serviceLevels.mockResolvedValue({
      ok: true,
      sites: [
        sleSite('site-primary', 94.5, { metricName: 'coverage', label: 'Coverage', successRate: 70.6 }),
        sleSite('site-afc', 100, null, 0),
      ],
      meta: { divergentMetrics: ['capacity', 'time_to_connect', 'roaming'] },
      error: null,
    });

    const r = await make().getServiceLevels.handler({});
    expect(r.basis).toBe('observed');
    // untrusted() wraps a network-sourced string as { __untrusted__, value };
    // the prompt builder fences it later.
    expect(r.worstFirst[0].site).toMatchObject({ __untrusted__: true, value: 'PrimarySite' });
    expect(r.worstFirst[0].overall).toBe(94.5);
    expect(r.worstFirst[0].weakestMetric).toBe('Coverage 70.6%');
  });

  it('lists the metrics that were NOT measured rather than scoring them', async () => {
    serviceLevels.mockResolvedValue({
      ok: true,
      sites: [sleSite('site-primary', 94.5, { metricName: 'coverage', label: 'Coverage', successRate: 70.6 })],
      meta: {},
      error: null,
    });
    const r = await make().getServiceLevels.handler({});
    expect(r.worstFirst[0].notMeasured).toContain('ap_health');
    expect(r.note).toMatch(/NOT MEASURED/);
    expect(r.note).toMatch(/never as 100%/);
  });

  it('declares that three metrics can differ from the number on screen', async () => {
    serviceLevels.mockResolvedValue({ ok: true, sites: [sleSite('site-primary', 94.5, null)], meta: {}, error: null });
    const r = await make().getServiceLevels.handler({});
    // The server normalizer's thresholds genuinely diverge for these, and it
    // never reads the operator's saved thresholds at all.
    expect(r.thresholdCaveat).toMatch(/capacity, time_to_connect, roaming/);
    expect(r.thresholdCaveat).toMatch(/can differ/);
  });

  it('NAMES the disagreement when the collector has data the Gateway does not', async () => {
    // The headline contradiction. AFC LAB is scored by the collector over 34
    // entities, and live client telemetry holds no row for it at all.
    serviceLevels.mockResolvedValue({
      ok: true,
      sites: [sleSite('site-afc', 94.5, { metricName: 'coverage', label: 'Coverage', successRate: 70.6 }, 34)],
      meta: {},
      error: null,
    });

    const r = await make().getServiceLevels.handler({});
    expect(r.contradictsLiveTelemetry).toHaveLength(1);
    expect(r.contradictsLiveTelemetry[0]).toMatchObject({
      collectorMeasuredOver: 34,
      liveGatewayClientRows: 0,
    });
    expect(r.note).toMatch(/disagree/i);
    expect(r.note).toMatch(/cannot tell from here which one is wrong/i);
  });

  it('does not invent a disagreement when the two sources agree', async () => {
    // PrimarySite has four live client rows in the stub, so a scored site
    // there is corroborated, not contradicted.
    serviceLevels.mockResolvedValue({
      ok: true,
      sites: [sleSite('site-primary', 94.5, { metricName: 'coverage', label: 'Coverage', successRate: 70.6 })],
      meta: {},
      error: null,
    });
    const r = await make().getServiceLevels.handler({});
    expect(r.contradictsLiveTelemetry).toEqual([]);
    expect(r.note).toMatch(/agree/i);
  });

  it('says service levels are unavailable rather than implying health', async () => {
    resolveSourceIds.mockResolvedValue({ ok: true, sourceIds: [], sources: [], error: null });
    const r = await make().getServiceLevels.handler({});
    expect(r.unavailable).toBe(true);
    expect(r.basis).toBe('unknown');
    expect(r.instruction).toMatch(/do NOT infer that service is good/i);
    expect(serviceLevels).not.toHaveBeenCalled();
  });

  it('treats an empty sample set as a collection gap, not a healthy estate', async () => {
    serviceLevels.mockResolvedValue({ ok: true, sites: [], meta: {}, error: null });
    const r = await make().getServiceLevels.handler({});
    expect(r.status).toBe('never_collected');
    expect(r.instruction).toMatch(/not a healthy network/i);
  });

  it('surfaces a failed read as fetch_failed, never as zero sites', async () => {
    serviceLevels.mockResolvedValue({ ok: false, sites: [], meta: {}, error: 'pool exhausted' });
    const r = await make().getServiceLevels.handler({});
    expect(r.status).toBe('fetch_failed');
    expect(r.instruction).toMatch(/Do not report zero, none, or healthy/i);
  });

  it('honours the bound site scope', async () => {
    serviceLevels.mockResolvedValue({
      ok: true,
      sites: [sleSite('site-primary', 94.5, null), sleSite('site-afc', 100, null)],
      meta: {},
      error: null,
    });
    const r = await make({ siteNames: ['PrimarySite'] }).getServiceLevels.handler({});
    expect(r.siteCount).toBe(1);
    expect(r.scopeApplied).toMatchObject({ level: 'site', siteNames: ['PrimarySite'] });
  });

  it('refuses to report health when the site filter matches nothing', async () => {
    serviceLevels.mockResolvedValue({ ok: true, sites: [sleSite('site-afc', 100, null)], meta: {}, error: null });
    const r = await make({ siteNames: ['Nowhere'] }).getServiceLevels.handler({});
    expect(r.status).toBe('scope_matched_nothing');
    expect(r.instruction).toMatch(/not good news/i);
  });
});

describe('getInfrastructureAlerts — the plumbing probes', () => {
  const CONFIGURED = {
    configured: true,
    polling: true,
    lastPollAt: '2026-09-15T14:41:42Z',
    siteId: null,
    authExpired: false,
    checks: {
      radius_reachability: { status: 'error', lastRunAt: '2026-09-15T14:41:40Z', alertCount: 3 },
      dhcp_reachability: { status: 'ok', lastRunAt: '2026-09-15T14:41:40Z', alertCount: 0 },
      cert_expiry: { status: 'idle', lastRunAt: null, alertCount: 0 },
    },
  };

  it('carries the repeat count and context the old resolver flattened away', async () => {
    infrastructureAlerts.mockReturnValue({
      ok: true,
      status: CONFIGURED,
      counts: { critical: 1, warning: 0, info: 0 },
      alertCount: 1,
      truncated: false,
      alerts: [
        {
          severity: 'critical',
          checkName: 'radius_reachability',
          message: 'RADIUS server 192.168.100.1 unreachable (Authentication, policy: Pf_RadiusServer)',
          target: '192.168.100.1',
          occurrences: 497,
          firstSeenAt: '2026-09-01T00:00:00Z',
          lastSeenAt: '2026-09-15T14:41:40Z',
          resolvedAt: null,
          acknowledgedAt: null,
          context: { policy: 'Pf_RadiusServer', mode: 'Authentication' },
        },
      ],
      error: null,
    });

    const r = await make().getInfrastructureAlerts.handler({});
    expect(r.basis).toBe('observed');
    expect(r.alerts[0].occurrences).toBe(497);
    expect(r.alerts[0].context).toEqual({ policy: 'Pf_RadiusServer', mode: 'Authentication' });
    // Network-sourced strings are MARKED untrusted so the prompt builder can
    // fence them as data. A RADIUS policy name is operator-writable text.
    expect(r.alerts[0].message).toMatchObject({ __untrusted__: true });
    expect(r.alerts[0].target).toMatchObject({ __untrusted__: true, value: '192.168.100.1' });
  });

  it('names probes that have never run, so silence is not read as a pass', async () => {
    infrastructureAlerts.mockReturnValue({
      ok: true,
      status: CONFIGURED,
      counts: { critical: 0, warning: 0, info: 0 },
      alertCount: 0,
      truncated: false,
      alerts: [],
      error: null,
    });
    const r = await make().getInfrastructureAlerts.handler({});
    expect(r.probesNeverRan).toContain('cert_expiry');
    expect(r.note).toMatch(/silence is not a pass/i);
  });

  it('refuses to report clean plumbing when the engine was never configured', async () => {
    // Zero alerts from an engine that has never polled means NOT CHECKED. This
    // is the same defect as reading an empty poll table as healthy.
    infrastructureAlerts.mockReturnValue({
      ok: true,
      status: { configured: false, polling: false, checks: {} },
      counts: { critical: 0, warning: 0, info: 0 },
      alertCount: 0,
      truncated: false,
      alerts: [],
      error: null,
    });
    const r = await make().getInfrastructureAlerts.handler({});
    expect(r.status).toBe('never_configured');
    expect(r.unavailable).toBe(true);
    expect(r.instruction).toMatch(/NOT CHECKED, not healthy/i);
  });

  it('states that alerts carry no site attribution on this platform', async () => {
    infrastructureAlerts.mockReturnValue({
      ok: true,
      status: CONFIGURED,
      counts: { critical: 0, warning: 0, info: 0 },
      alertCount: 0,
      truncated: false,
      alerts: [],
      error: null,
    });
    const r = await make().getInfrastructureAlerts.handler({});
    // sentinel_alerts has no site_id column and no check writes one, so an
    // answer that assigns an alert to a site would be inventing the link.
    expect(r.note).toMatch(/NO site attribution/i);
    expect(r).toHaveProperty('engineSiteScope');
  });

  it('surfaces an engine failure as a failed read', async () => {
    infrastructureAlerts.mockReturnValue({ ok: false, status: null, alerts: [], error: 'engine destroyed' });
    const r = await make().getInfrastructureAlerts.handler({});
    expect(r.status).toBe('fetch_failed');
  });

  it('fetches analytics only when asked', async () => {
    infrastructureAlerts.mockReturnValue({
      ok: true,
      status: CONFIGURED,
      counts: { critical: 0, warning: 0, info: 0 },
      alertCount: 0,
      truncated: false,
      alerts: [],
      error: null,
    });
    infrastructureAnalytics.mockResolvedValue({
      ok: true,
      analytics: { total: 7, mttrSeconds: 639_660 },
      error: null,
    });

    const without = await make().getInfrastructureAlerts.handler({});
    expect(infrastructureAnalytics).not.toHaveBeenCalled();
    expect(without.analytics).toBeNull();

    const withAnalytics = await make().getInfrastructureAlerts.handler({ includeAnalytics: true });
    expect(withAnalytics.analytics).toMatchObject({ total: 7 });
  });
});

/**
 * Regressions from a live run against a Gateway whose /v1/report/flex/3H was
 * returning 500 "Exception: null" after ~31 s — the appliance's own reporting
 * timeout.
 *
 * The answer that came back was epistemically careful and completely useless:
 * it declared it could not rank any site, while a successful getServiceLevels
 * call sat in its own evidence panel marked `ok observed`. Three separate
 * things conspired, and one of them was a lie this tool told.
 */
describe('getServiceLevels when live telemetry is down', () => {
  const FAILING_SESSION = {
    baseUrl: 'https://gw.test',
    get: async (path) => {
      if (path.startsWith('/v1/report/flex')) {
        return { ok: false, status: 500, data: null, errorSummary: 'Exception: null' };
      }
      if (path === '/v3/sites') return { ok: true, status: 200, data: SITES };
      return { ok: false, status: 404, data: null, errorSummary: 'not found' };
    },
  };

  const makeFailing = (scope = {}) =>
    createDiagnosticTools({
      session: FAILING_SESSION,
      scope,
      capabilities: new CapabilityRegistry(),
    });

  beforeEach(() => {
    serviceLevels.mockResolvedValue({
      ok: true,
      sites: [
        sleSite('site-primary', 94.5, { metricName: 'coverage', label: 'Coverage', successRate: 70.6 }),
        sleSite('site-afc', 100, null),
      ],
      meta: {},
      error: null,
    });
  });

  it('does NOT report a failed cross-check as agreement', async () => {
    // The bug. `disagreements` was empty because the read failed, and the note
    // then asserted "The collector and live Gateway telemetry agree on which
    // sites have clients" — a claim manufactured out of a 500.
    const r = await makeFailing().getServiceLevels.handler({});
    expect(r.liveTelemetryComparison).toBe('unavailable');
    expect(r.contradictsLiveTelemetry).toEqual([]);
    // The forbidden sentence, verbatim — the one the tool used to emit off the
    // back of a 500. Matching on bare /agree/i would also catch the new
    // wording "that is not agreement", which is the correction, not the bug.
    expect(r.note).not.toMatch(/telemetry agree on which sites/i);
    expect(r.note).toMatch(/not agreement/i);
  });

  it('still hands back the ranking, and says the corroboration is what is missing', async () => {
    // The service levels came from AURA's own database and are untouched by the
    // Gateway fault. Discarding them was the expensive part of that answer.
    const r = await makeFailing().getServiceLevels.handler({});
    expect(r.basis).toBe('observed');
    expect(r.siteCount).toBe(2);
    expect(r.worstFirst[0].overall).toBe(94.5);
    expect(r.note).toMatch(/STILL VALID/i);
    expect(r.note).toMatch(/not a reason to discard/i);
    expect(r.liveTelemetryReadError).toMatch(/Exception: null/);
  });

  it('does not wait on a read that is going to time out', async () => {
    // Orientation is the first tool a wireless question runs. A flex read that
    // 500s after 31 s must not be 31 s of an operator's time.
    const slow = {
      baseUrl: 'https://gw.test',
      get: async (path) => {
        if (path.startsWith('/v1/report/flex')) {
          await new Promise((r) => setTimeout(r, 30_000));
          return { ok: false, status: 500, data: null, errorSummary: 'Exception: null' };
        }
        if (path === '/v3/sites') return { ok: true, status: 200, data: SITES };
        return { ok: false, status: 404, data: null, errorSummary: 'not found' };
      },
    };
    const tools = createDiagnosticTools({
      session: slow,
      scope: {},
      capabilities: new CapabilityRegistry(),
    });

    const t0 = Date.now();
    const r = await tools.getServiceLevels.handler({});
    const elapsed = Date.now() - t0;

    expect(elapsed).toBeLessThan(12_000);
    expect(r.liveTelemetryComparison).toBe('unavailable');
    expect(r.siteCount).toBe(2);
  }, 20_000);
});

describe('listSites when the telemetry read fails', () => {
  it('reports hasTelemetry as UNKNOWN, not false, for every site', async () => {
    // One failed request was becoming seven per-site factual claims: the live
    // answer said "none of the 7 sites have any live measurements at all",
    // which is a statement about the sites when it was a statement about the
    // request.
    const failing = {
      baseUrl: 'https://gw.test',
      get: async (path) => {
        if (path.startsWith('/v1/report/flex')) {
          return { ok: false, status: 500, data: null, errorSummary: 'Exception: null' };
        }
        if (path === '/v3/sites') return { ok: true, status: 200, data: SITES };
        if (path === '/v1/aps/query') return { ok: true, status: 200, data: [] };
        return { ok: false, status: 404, data: null, errorSummary: 'not found' };
      },
    };
    const tools = createDiagnosticTools({
      session: failing,
      scope: {},
      capabilities: new CapabilityRegistry(),
    });

    const r = await tools.listSites.handler({});
    expect(r.telemetryReadOk).toBe(false);
    expect(r.sites.every((s) => s.hasTelemetry === null)).toBe(true);
    expect(r.sites.every((s) => s.clientCount === null)).toBe(true);
    expect(r.sites.every((s) => s.healthBasis === 'read_failed')).toBe(true);
    // A "silent site" is one that reported nothing, not one nobody could ask.
    expect(r.silentSites).toEqual([]);
    expect(r.note).toMatch(/UNKNOWN, not zero and not false/i);
    expect(r.note).toMatch(/claim about the sites/i);
  });

  it('still distinguishes a genuinely silent site when the read SUCCEEDS', async () => {
    // The original behaviour has to survive: a configured site that reports no
    // clients is real and valuable information.
    const tools = make();
    const r = await tools.listSites.handler({});
    expect(r.telemetryReadOk).toBe(true);
    const primary = r.sites.find((s) => s.name?.value === 'PrimarySite');
    expect(primary.hasTelemetry).toBe(true);
    expect(primary.clientCount).toBe(4);
    expect(r.note).toMatch(/never as healthy/i);
  });
});

describe('a failed site-level read names the route that still works', () => {
  const failing = {
    baseUrl: 'https://gw.test',
    get: async (path) => {
      if (path.startsWith('/v1/report/flex')) {
        return { ok: false, status: 500, data: null, errorSummary: 'Exception: null' };
      }
      if (path === '/v3/sites') return { ok: true, status: 200, data: SITES };
      if (path === '/v1/aps/query') return { ok: true, status: 200, data: [] };
      return { ok: false, status: 404, data: null, errorSummary: 'not found' };
    },
  };
  const tools = () =>
    createDiagnosticTools({ session: failing, scope: {}, capabilities: new CapabilityRegistry() });

  it('points getSiteOverview at getServiceLevels instead of dead-ending', async () => {
    // The live answer concluded "I cannot tell you which sites have problem
    // clients" while AURA's own service levels could have ranked them. A dead
    // end and a detour are different answers.
    const r = await tools().getSiteOverview.handler({});
    expect(r.status).toBe('fetch_failed');
    expect(r.instruction).toMatch(/getServiceLevels/);
    expect(r.instruction).toMatch(/does NOT mean the question is unanswerable/i);
  });

  it('points correlateProblem the same way', async () => {
    const r = await tools().correlateProblem.handler({});
    expect(r.status).toBe('fetch_failed');
    expect(r.instruction).toMatch(/getServiceLevels/);
  });

  it('does NOT offer a per-site ranking to a single-client question', async () => {
    // diagnoseClient failing is not answerable by a site scoreboard, and
    // suggesting one would send the model somewhere useless.
    const r = await tools().diagnoseClient.handler({ mac: '58:9A:3E:E8:1D:00' });
    expect(r.status).toBe('fetch_failed');
    expect(r.instruction).not.toMatch(/getServiceLevels/);
  });
});
