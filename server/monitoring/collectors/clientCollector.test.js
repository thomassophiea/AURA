import { describe, it, expect } from 'vitest';
import { collectClients, METRIC_FAMILY } from './clientCollector.js';

const SALT = 'test-salt-not-a-real-one';

const baseConfig = {
  persistClientIdentifiers: true,
  clientPseudonymSalt: SALT,
  retentionDays: 7,
};

const source = { id: 'src-1', orgId: 'org-1', siteGroupId: 'sg-1' };

/** A client row good enough to score: real signal, real timestamps. */
function healthyRow(overrides = {}) {
  return {
    MAC: 'AA:BB:CC:DD:EE:01',
    Hostname: 'thomas-laptop',
    Username: 'tsophiea',
    IP: '192.168.100.55',
    Rss: -62,
    SNR: 33,
    RFQI: 5,
    RadioID: 2,
    Channel: 36,
    '11Protocol': '11ax',
    ApSerial: 'CV012408S-C0044',
    SiteUUID: 'site-uuid-1',
    RFSUUID: 'wlan-uuid-1',
    WirelessRTT: 4,
    NetworkRTT: 12,
    DNSRTT: 20,
    ThroughputBps: 8_000_000,
    RxRate: 400_000_000,
    TxRate: 300_000_000,
    RxPkts: 990,
    DLLostPkts: 10,
    LastUpdate: 1_757_000_000,
    ...overrides,
  };
}

function evidenceReturning(read) {
  return () => ({ clients: async () => read });
}

async function collect(rows, config = baseConfig) {
  return collectClients({
    session: { get: async () => ({ ok: true }) },
    source,
    config,
    now: new Date('2026-09-10T12:00:00Z'),
    evidenceFn: evidenceReturning({ ok: true, rows, error: null }),
  });
}

describe('clientCollector', () => {
  it('collects nothing at all when the privacy flag is off', async () => {
    const result = await collect([healthyRow()], {
      ...baseConfig,
      persistClientIdentifiers: false,
    });
    expect(result.samples).toEqual([]);
    expect(result.fatal).toBeNull();
    expect(result.notes.join(' ')).toMatch(/MONITORING_PERSIST_CLIENT_IDENTIFIERS/);
  });

  it('collects nothing when the flag is on but no salt is configured', async () => {
    // Storing a raw identifier is never the fallback for a missing salt.
    const result = await collect([healthyRow()], {
      ...baseConfig,
      clientPseudonymSalt: null,
    });
    expect(result.samples).toEqual([]);
    expect(result.notes.join(' ')).toMatch(/SALT/i);
  });

  it('never stores the MAC, hostname, username or IP address', async () => {
    const result = await collect([healthyRow()]);
    expect(result.samples.length).toBeGreaterThan(0);

    const serialised = JSON.stringify(result.samples);
    expect(serialised).not.toContain('AA:BB:CC:DD:EE:01');
    expect(serialised.toLowerCase()).not.toContain('aabbccddee01');
    expect(serialised).not.toContain('thomas-laptop');
    expect(serialised).not.toContain('tsophiea');
    expect(serialised).not.toContain('192.168.100.55');

    // The pseudonym is there, and it is a 32-hex HMAC prefix.
    for (const s of result.samples) {
      expect(s.clientExternalId).toMatch(/^[0-9a-f]{32}$/);
    }
  });

  it('records DHCP outcome as a 0/1 metric rather than the address', async () => {
    const withIp = await collect([healthyRow()]);
    const withoutIp = await collect([healthyRow({ IP: null })]);
    const value = (r) => r.samples.find((s) => s.metricName === 'has_ipv4')?.numericValue;
    expect(value(withIp)).toBe(1);
    expect(value(withoutIp)).toBe(0);
  });

  it('is deterministic: the same client hashes to the same id across ticks', async () => {
    const a = await collect([healthyRow()]);
    const b = await collect([healthyRow({ Rss: -70 })]);
    expect(a.samples[0].clientExternalId).toBe(b.samples[0].clientExternalId);
  });

  it('gives different clients different pseudonyms', async () => {
    const result = await collect([healthyRow(), healthyRow({ MAC: 'AA:BB:CC:DD:EE:02' })]);
    const ids = new Set(result.samples.map((s) => s.clientExternalId));
    expect(ids.size).toBe(2);
  });

  it('suppresses sentinel RTTs instead of storing them as measurements', async () => {
    // 65535 means NOT MEASURED. Stored as a number it becomes a permanent,
    // fabricated 65-second latency that every later comparison inherits.
    const result = await collect([
      healthyRow({ WirelessRTT: 65535, NetworkRTT: 65535, DNSRTT: 65535 }),
    ]);
    const names = result.samples.map((s) => s.metricName);
    expect(names).not.toContain('wireless_rtt');
    expect(names).not.toContain('network_rtt');
    expect(names).not.toContain('dns_rtt');
    // The rest of the row still stores.
    expect(names).toContain('rss');
  });

  it('skips idle placeholder rows rather than recording a phantom outage', async () => {
    const result = await collect([healthyRow({ Rss: 0, SNR: -10000 })]);
    expect(result.samples).toEqual([]);
    expect(result.notes.join(' ')).toMatch(/idle\/placeholder/);
  });

  it('sets every field the metric_samples schema requires', async () => {
    const result = await collect([healthyRow()]);
    for (const s of result.samples) {
      // expires_at is NOT NULL in the schema — a missing one fails the insert
      // for the whole transaction, losing the entire poll.
      expect(s.expiresAt).toBeInstanceOf(Date);
      expect(Number.isNaN(s.expiresAt.getTime())).toBe(false);
      // quality_state is CHECK-constrained; 'ok' would be rejected.
      expect(['observed', 'collection_timestamped']).toContain(s.qualityState);
      expect(s.metricFamily).toBe(METRIC_FAMILY);
      expect(s.observedAt).toBeInstanceOf(Date);
      expect(typeof s.numericValue).toBe('number');
      expect(Number.isFinite(s.numericValue)).toBe(true);
      expect(s.monitoredSourceId).toBe('src-1');
    }
  });

  it('anchors expiry to the observation, not to collection time', async () => {
    const result = await collect([healthyRow()]);
    const s = result.samples[0];
    expect(s.expiresAt.getTime() - s.observedAt.getTime()).toBe(7 * 24 * 3600 * 1000);
  });

  it('marks a row with no source timestamp as collection_timestamped', async () => {
    const result = await collect([healthyRow({ LastUpdate: null, StatsTimestamp: null })]);
    expect(result.samples[0].qualityState).toBe('collection_timestamped');
  });

  it('reports a failed read as fatal rather than as an empty client list', async () => {
    const result = await collectClients({
      session: { get: async () => ({ ok: false }) },
      source,
      config: baseConfig,
      now: new Date(),
      evidenceFn: evidenceReturning({ ok: false, rows: [], error: 'timeout after 30s' }),
    });
    expect(result.samples).toEqual([]);
    expect(result.fatal).toMatchObject({ errorClass: 'upstream' });
    expect(result.fatal.summary).toMatch(/timeout/);
  });

  it('caps very large tables, keeps the worst signal, and says how many it dropped', async () => {
    const rows = [];
    for (let i = 0; i < 600; i += 1) {
      rows.push(
        healthyRow({
          MAC: `AA:BB:CC:00:${String(Math.floor(i / 256)).padStart(2, '0')}:${String(i % 256).padStart(2, '0')}`,
          // Higher index = better signal, so the cap must keep the low indices.
          Rss: -90 + Math.floor(i / 10),
        })
      );
    }
    const result = await collect(rows);
    const clients = new Set(result.samples.map((s) => s.clientExternalId));
    expect(clients.size).toBe(500);
    expect(result.notes.join(' ')).toMatch(/100 client\(s\) beyond the 500-client cap/);

    // The worst client (-90 dBm) must survive the cap; the best (-30) must not.
    const worstRss = Math.min(
      ...result.samples.filter((s) => s.metricName === 'rss').map((s) => s.numericValue)
    );
    const bestRss = Math.max(
      ...result.samples.filter((s) => s.metricName === 'rss').map((s) => s.numericValue)
    );
    expect(worstRss).toBe(-90);
    expect(bestRss).toBeLessThan(-30);
  });

  it('collapses duplicate rows for one client instead of colliding on insert', async () => {
    // MEASURED ON INTEGRATION: two MuTable rows for the same client at the same
    // instant produced two samples with an identical uniqueness key, and
    // Postgres rejected the ENTIRE batch — "ON CONFLICT DO UPDATE command
    // cannot affect row a second time" — so every client in that tick was lost,
    // not just the duplicate.
    const result = await collect([
      healthyRow({ Rss: -70, LastUpdate: 1_757_000_000 }),
      healthyRow({ Rss: -60, LastUpdate: 1_757_000_060 }), // same MAC, fresher
    ]);

    const keys = result.samples.map((s) =>
      [
        s.monitoredSourceId,
        s.siteId ?? '',
        s.deviceExternalId ?? '',
        s.radioExternalId ?? '',
        s.wlanExternalId ?? '',
        s.clientExternalId,
        s.metricFamily,
        s.metricName,
        s.observedAt.toISOString(),
        JSON.stringify(s.dimensions),
      ].join('|')
    );
    expect(new Set(keys).size).toBe(keys.length);

    // The freshest row wins, so the stored value is the current one.
    expect(result.samples.find((s) => s.metricName === 'rss').numericValue).toBe(-60);
    expect(result.notes.join(' ')).toMatch(/1 duplicate MuTable row\(s\) collapsed/);
  });

  it('keeps no-MAC rows out of the count of collapsed duplicates', async () => {
    const result = await collect([healthyRow(), { Rss: -60, SNR: 20 }]);
    expect(result.notes.join(' ')).toMatch(/1 row\(s\) had no MAC/);
    expect(result.notes.join(' ')).not.toMatch(/collapsed/);
  });

  it('keeps only non-identifying radio facts in dimensions', async () => {
    const result = await collect([healthyRow()]);
    for (const s of result.samples) {
      expect(Object.keys(s.dimensions).sort()).toEqual(['band', 'channel', 'protocol']);
    }
    expect(result.samples[0].dimensions.band).toBe('5GHz');
  });
});
