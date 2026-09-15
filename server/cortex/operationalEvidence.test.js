/**
 * AURA's operational insight surfaces as Cortex evidence.
 *
 * The failure these close: the Service Levels page showed PrimarySite at 94.5%
 * with Coverage 70.6% over 34 clients, while Cortex — on the same platform, in
 * the same minute — reported that none of the seven sites had any telemetry at
 * all. Both reads ran honestly. Only one had looked at the operational insight
 * the product already held.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryLatest = vi.fn();
const getAlertAnalytics = vi.fn();
const engine = {
  getStatus: vi.fn(),
  getAllAlerts: vi.fn(),
};

vi.mock('../monitoring/sampleRepository.js', () => ({ queryLatest: (...a) => queryLatest(...a) }));
vi.mock('../monitoring/metricRegistry.js', () => ({ METRIC_FAMILIES: { SLE: 'sle' } }));
vi.mock('../sentinel/sentinelEngine.js', () => ({
  sentinelEngine: {
    getStatus: (...a) => engine.getStatus(...a),
    getAllAlerts: (...a) => engine.getAllAlerts(...a),
  },
}));
vi.mock('../sentinel/sentinelRepository.js', () => ({
  getAlertAnalytics: (...a) => getAlertAnalytics(...a),
}));

const {
  serviceLevels,
  infrastructureAlerts,
  infrastructureAnalytics,
  sleStatus,
  SLE_METRIC_ORDER,
  SLE_SERVER_DIVERGENT_METRICS,
} = await import('./operationalEvidence.js');

const NOW = Date.parse('2026-09-15T15:00:00Z');

/** One stored SLE sample, shaped as sampleRepository maps it. */
function sample(siteId, metricName, numericValue, denominator = 34) {
  return {
    siteId,
    metricName,
    metricFamily: 'sle',
    numericValue,
    numerator: Math.round((numericValue / 100) * denominator),
    denominator,
    unit: '%',
    qualityState: 'collection_timestamped',
    observedAt: new Date(NOW - 60_000).toISOString(),
    collectedAt: new Date(NOW - 60_000).toISOString(),
    deviceExternalId: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('serviceLevels — the per-site rollup, server-side', () => {
  it('reconstructs the scoreboard the browser computes, worst first', () => {
    queryLatest.mockResolvedValue([
      sample('site-a', 'coverage', 70.6),
      sample('site-a', 'throughput', 100),
      sample('site-a', 'ap_health', 100),
      sample('site-b', 'coverage', 100),
      sample('site-b', 'throughput', 100),
    ]);

    return serviceLevels({ sourceIds: ['s1'], now: NOW }).then((res) => {
      expect(res.ok).toBe(true);
      // site-a is worse and must sort first — the page is "worst first".
      expect(res.sites[0].siteId).toBe('site-a');
      expect(res.sites[0].overall).toBeCloseTo(90.2, 1);
      expect(res.sites[0].weakestMetric).toMatchObject({
        metricName: 'coverage',
        successRate: 70.6,
      });
      expect(res.sites[1].siteId).toBe('site-b');
    });
  });

  it('names the weakest metric as null when nothing is below 100', async () => {
    queryLatest.mockResolvedValue([
      sample('site-b', 'coverage', 100),
      sample('site-b', 'throughput', 100),
    ]);
    const res = await serviceLevels({ sourceIds: ['s1'], now: NOW });
    expect(res.sites[0].weakestMetric).toBeNull();
  });

  it('reports a metric with no sample as NOT MEASURED, never as 100%', async () => {
    // The normalizer emits nothing when denominator <= 0. If an absent metric
    // were treated as passing, a collection gap would become a clean bill.
    queryLatest.mockResolvedValue([sample('site-a', 'coverage', 70.6)]);
    const res = await serviceLevels({ sourceIds: ['s1'], now: NOW });
    expect(res.sites[0].metricsMeasured).toEqual(['coverage']);
    expect(res.sites[0].metricsNotMeasured).toHaveLength(SLE_METRIC_ORDER.length - 1);
    expect(res.sites[0].metricsNotMeasured).toContain('ap_health');
    // The overall is the mean of what WAS measured, not of seven metrics.
    expect(res.sites[0].overall).toBeCloseTo(70.6, 1);
  });

  it('sorts a site with no score LAST rather than treating it as perfect', async () => {
    queryLatest.mockResolvedValue([
      sample('site-a', 'coverage', 70.6),
      // denominator 0 — present in the table but scored over nothing.
      sample('site-quiet', 'coverage', 0, 0),
    ]);
    const res = await serviceLevels({ sourceIds: ['s1'], now: NOW });
    expect(res.sites.map((s) => s.siteId)).toEqual(['site-a', 'site-quiet']);
    expect(res.sites[1].overall).toBeNull();
    expect(res.sites[1].overallStatus).toBe('no_data');
  });

  it('is a failed read, not an empty estate, when no source matches', async () => {
    const res = await serviceLevels({ sourceIds: [], now: NOW });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/no monitoring source/i);
    expect(queryLatest).not.toHaveBeenCalled();
  });

  it('does not throw into the tool layer when the query fails', async () => {
    queryLatest.mockRejectedValue(new Error('connection terminated'));
    const res = await serviceLevels({ sourceIds: ['s1'], now: NOW });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/connection terminated/);
  });

  it('declares which metrics the server recomputes differently from the page', async () => {
    queryLatest.mockResolvedValue([sample('site-a', 'coverage', 70.6)]);
    const res = await serviceLevels({ sourceIds: ['s1'], now: NOW });
    // sleNormalizer's defaults genuinely diverge for these three, and the
    // operator's saved thresholds reach the browser only.
    expect(res.meta.divergentMetrics).toEqual(SLE_SERVER_DIVERGENT_METRICS);
    expect(SLE_SERVER_DIVERGENT_METRICS).toEqual(['capacity', 'time_to_connect', 'roaming']);
  });

  it('bands scores the way the page does, and has a band for no data', () => {
    expect(sleStatus(100)).toBe('good');
    expect(sleStatus(95)).toBe('good');
    expect(sleStatus(94.5)).toBe('warn');
    expect(sleStatus(70.6)).toBe('poor');
    expect(sleStatus(null)).toBe('no_data');
  });
});

describe('infrastructureAlerts — active probes', () => {
  const OK_STATUS = {
    configured: true,
    polling: true,
    lastPollAt: '2026-09-15T14:41:42Z',
    siteId: null,
    authExpired: false,
    activeAlerts: 3,
    checks: {
      radius_reachability: { status: 'error', lastRunAt: '2026-09-15T14:41:40Z', alertCount: 3 },
      dhcp_reachability: { status: 'ok', lastRunAt: '2026-09-15T14:41:40Z', alertCount: 0 },
    },
  };

  it('ranks by severity, then by how often the condition has recurred', async () => {
    engine.getStatus.mockReturnValue(OK_STATUS);
    engine.getAllAlerts.mockReturnValue([
      { severity: 'critical', checkName: 'radius_reachability', message: 'a', target: '1.1.1.1', occurrences: 2 },
      { severity: 'warning', checkName: 'vlan_trunk', message: 'b', target: 'AP1', occurrences: 900 },
      { severity: 'critical', checkName: 'radius_reachability', message: 'c', target: '192.168.100.1', occurrences: 497 },
    ]);

    const res = await infrastructureAlerts();
    expect(res.ok).toBe(true);
    // A sustained critical outranks a one-off critical; both outrank a warning
    // however noisy it is.
    expect(res.alerts.map((a) => a.occurrences)).toEqual([497, 2, 900]);
    expect(res.counts).toEqual({ critical: 2, warning: 1, info: 0 });
  });

  it('preserves the repeat count and the context the old resolver destroyed', async () => {
    // truncateResult()/compactItem() in toolDispatcher capped alerts at 20 and
    // replaced every nested object with the string '<object>', so apSerial,
    // vlanId and gateway never reached the model.
    engine.getStatus.mockReturnValue(OK_STATUS);
    engine.getAllAlerts.mockReturnValue([
      {
        severity: 'critical',
        checkName: 'radius_reachability',
        message: 'RADIUS server 192.168.100.1 unreachable (Authentication, policy: Pf_RadiusServer)',
        target: '192.168.100.1',
        occurrences: 497,
        context: { policy: 'Pf_RadiusServer', mode: 'Authentication' },
      },
    ]);
    const res = await infrastructureAlerts();
    expect(res.alerts[0].occurrences).toBe(497);
    expect(res.alerts[0].context).toEqual({ policy: 'Pf_RadiusServer', mode: 'Authentication' });
  });

  it('reports truncation rather than silently dropping alerts', async () => {
    engine.getStatus.mockReturnValue(OK_STATUS);
    engine.getAllAlerts.mockReturnValue(
      Array.from({ length: 50 }, (_, i) => ({
        severity: 'warning',
        checkName: 'vlan_trunk',
        message: `m${i}`,
        target: `AP${i}`,
        occurrences: 1,
      }))
    );
    const res = await infrastructureAlerts({ limit: 40 });
    expect(res.alerts).toHaveLength(40);
    expect(res.alertCount).toBe(50);
    expect(res.truncated).toBe(true);
  });

  it('does not throw into the tool layer when the engine throws', async () => {
    engine.getStatus.mockImplementation(() => {
      throw new Error('engine destroyed');
    });
    const res = await infrastructureAlerts();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/engine destroyed/);
  });
});

describe('infrastructureAnalytics', () => {
  it('says aggregates are unavailable rather than reporting zero', async () => {
    // getAlertAnalytics returns null when persistence is unavailable. Zero MTTR
    // would read as "everything resolves instantly".
    getAlertAnalytics.mockResolvedValue(null);
    const res = await infrastructureAnalytics({ days: 30 });
    expect(res.ok).toBe(false);
    expect(res.analytics).toBeNull();
    expect(res.error).toMatch(/not persisting/i);
  });

  it('passes through MTTA, MTTR and the noisiest checks', async () => {
    getAlertAnalytics.mockResolvedValue({
      windowDays: 30,
      total: 7,
      bySeverity: { critical: 6, warning: 1 },
      mttaSeconds: null,
      mttrSeconds: 639_660,
      noisiestChecks: [{ check_name: 'radius_reachability', count: 3, occurrences: 1491 }],
      noisiestTargets: [{ target: '192.168.100.1', count: 2 }],
    });
    const res = await infrastructureAnalytics({ days: 30 });
    expect(res.ok).toBe(true);
    expect(res.analytics.total).toBe(7);
    expect(res.analytics.noisiestChecks[0].check_name).toBe('radius_reachability');
  });
});
