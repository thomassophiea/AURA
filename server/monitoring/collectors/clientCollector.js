/**
 * Per-client history collector.
 *
 * WHY THIS HAD TO BE BUILT
 * ------------------------
 * `MONITORING_PERSIST_CLIENT_IDENTIFIERS` existed, was threaded through config,
 * and did nothing: there was no client collector, and every normaliser wrote
 * `clientExternalId: null` unconditionally. Turning the flag on changed no
 * behaviour at all. This is the collector that makes it mean something.
 *
 * WHAT IT STORES, AND WHAT IT DELIBERATELY DOES NOT
 * -------------------------------------------------
 * Stored: a pseudonymised client id (HMAC-SHA256 of the normalised MAC under
 * MONITORING_CLIENT_PSEUDONYM_SALT, truncated to 32 hex) plus numeric metrics.
 *
 * NOT stored: the MAC itself, hostname, username, or IP address. The pseudonym
 * is the whole point — it lets a specific client be followed over time without
 * the database holding an identifier that is meaningful outside this system.
 * `hasIpv4` is recorded as 0/1 so DHCP outcome is trendable without keeping the
 * address.
 *
 * The `dimensions` blob is restricted to non-identifying radio facts (band,
 * protocol, channel). It is tempting to put the hostname there for readability;
 * that would defeat the pseudonymisation entirely.
 *
 * SENTINELS ARE SUPPRESSED BEFORE STORAGE
 * ---------------------------------------
 * The Gateway reports 65535 for an unmeasured RTT, -10000 for a placeholder
 * SNR, and 0 for a placeholder RSS. Storing those would bake a fabricated
 * measurement into history permanently, where every future comparison would
 * inherit it. The evidence layer's accessors return null for all of them, and a
 * null metric is skipped rather than written as zero.
 */

import { GatewayEvidence, signal, rtt, isScorableClientRow } from '../../cortex/gatewayEvidence.js';
import { dedupeByMac } from '../../cortex/clientResolver.js';
import { pseudonymize } from '../credentialCrypto.js';
import { METRIC_FAMILIES } from '../metricRegistry.js';

export const COLLECTOR_NAME = 'client';
export const METRIC_FAMILY = METRIC_FAMILIES.CLIENT;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Ceiling on clients persisted per tick.
 *
 * Each client produces up to 11 metrics every poll, so an unbounded MuTable on
 * a large deployment would write tens of thousands of rows a minute — a real
 * risk to a database sized for per-device series. When the table is larger than
 * this, the WORST clients by signal are kept (the ones an investigation is
 * about) and the note says how many were dropped, so the cap is visible rather
 * than silently shaping history.
 */
const MAX_CLIENTS_PER_TICK = 500;

/**
 * Numeric metrics taken per client, each already sentinel-filtered.
 * `unit` and `metricKind` match what the normalisers use elsewhere.
 */
function metricsForRow(row) {
  const { rss, snr } = signal(row);
  const rfqiRaw = Number(row.RFQI);
  const lost = Number(row.DLLostPkts);
  const rx = Number(row.RxPkts);
  const lossRatio =
    Number.isFinite(lost) && Number.isFinite(rx) && rx + lost > 0 ? lost / (rx + lost) : null;

  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

  return [
    { name: 'rss', value: rss, unit: 'dBm' },
    { name: 'snr', value: snr, unit: 'dB' },
    { name: 'rfqi', value: Number.isFinite(rfqiRaw) ? rfqiRaw : null, unit: 'score' },
    { name: 'wireless_rtt', value: rtt(row.WirelessRTT), unit: 'ms' },
    { name: 'network_rtt', value: rtt(row.NetworkRTT), unit: 'ms' },
    { name: 'dns_rtt', value: rtt(row.DNSRTT), unit: 'ms' },
    { name: 'throughput_bps', value: num(row.ThroughputBps), unit: 'bps' },
    { name: 'rx_rate', value: num(row.RxRate), unit: 'bps' },
    { name: 'tx_rate', value: num(row.TxRate), unit: 'bps' },
    { name: 'downlink_loss_ratio', value: lossRatio, unit: 'ratio' },
    // 0/1 rather than the address: DHCP outcome becomes trendable without
    // storing an IP.
    { name: 'has_ipv4', value: row.IP ? 1 : 0, unit: 'boolean' },
  ];
}

/**
 * Collect one round of per-client samples.
 *
 * Matches the shape the other collectors return so collectorRunner can treat
 * it identically: { samples, partialFailures, cursorAdvances, notes,
 * endpointsTried, fatal }.
 */
export async function collectClients({ session, source, config, now = new Date(), evidenceFn }) {
  const notes = [];

  // The flag is the gate, and it fails CLOSED. Without it — or without a salt —
  // no client row is produced at all, so the default posture is unchanged and
  // an unpseudonymised identifier can never reach the database.
  if (!config?.persistClientIdentifiers) {
    return {
      samples: [],
      partialFailures: [],
      cursorAdvances: [],
      notes: ['client collection disabled (MONITORING_PERSIST_CLIENT_IDENTIFIERS is off)'],
      endpointsTried: [],
      fatal: null,
    };
  }
  if (!config?.clientPseudonymSalt) {
    return {
      samples: [],
      partialFailures: [],
      cursorAdvances: [],
      notes: ['client collection skipped: MONITORING_CLIENT_PSEUDONYM_SALT is not set'],
      endpointsTried: [],
      fatal: null,
    };
  }

  const evidence = evidenceFn ? evidenceFn(session) : new GatewayEvidence(session);
  const read = await evidence.clients();
  if (!read.ok) {
    return {
      samples: [],
      partialFailures: [],
      cursorAdvances: [],
      notes: [],
      endpointsTried: ['flex(MuTable)'],
      fatal: { errorClass: 'upstream', summary: read.error ?? 'MuTable read failed', status: null },
    };
  }

  const samples = [];
  let skippedPlaceholder = 0;

  // Counted before deduping, because dedupeByMac drops MAC-less rows silently.
  const withMac = read.rows.filter((r) => r?.MAC);
  const skippedNoMac = read.rows.length - withMac.length;

  // MuTable carries MORE THAN ONE ROW PER CLIENT — which is why the rest of the
  // codebase reads it through dedupeByMac. Left un-deduped, two rows for the
  // same MAC at the same timestamp on the same radio produce two samples with
  // an identical uniqueness key, and Postgres rejects the whole batch with
  // "ON CONFLICT DO UPDATE command cannot affect row a second time" — losing
  // every client in that tick, not just the duplicate. Measured on Integration.
  const rows = dedupeByMac(withMac);
  const collapsed = withMac.length - rows.length;

  const eligible = [];
  for (const row of rows) {
    // An idle/stale row carries placeholder signal values. Storing it would
    // write a phantom coverage failure into history for a client that was not
    // really associated.
    if (!isScorableClientRow(row)) {
      skippedPlaceholder += 1;
      continue;
    }
    eligible.push(row);
  }

  let dropped = 0;
  let kept = eligible;
  if (eligible.length > MAX_CLIENTS_PER_TICK) {
    // Worst signal first, so the cap keeps the clients a troubleshooting
    // question would actually be about.
    kept = [...eligible]
      .sort((a, b) => (signal(a).rss ?? 0) - (signal(b).rss ?? 0))
      .slice(0, MAX_CLIENTS_PER_TICK);
    dropped = eligible.length - kept.length;
  }

  const retentionMs = (config.retentionDays ?? 7) * MS_PER_DAY;

  for (const row of kept) {
    const clientExternalId = pseudonymize(row.MAC, config.clientPseudonymSalt);
    if (!clientExternalId) continue;

    // MuTable timestamps are seconds since epoch. When the row carries one the
    // reading is `observed`; when it does not, collection time is a substitute
    // and `quality_state` has to say so — that column is the difference between
    // "the Gateway measured this then" and "this is when we happened to look".
    const sourceSeconds = Number(row.LastUpdate ?? row.StatsTimestamp);
    const hasSourceTimestamp = Number.isFinite(sourceSeconds) && sourceSeconds > 0;
    const observedAt = hasSourceTimestamp ? new Date(sourceSeconds * 1000) : now;
    if (Number.isNaN(observedAt.getTime())) continue;
    const qualityState = hasSourceTimestamp ? 'observed' : 'collection_timestamped';

    for (const metric of metricsForRow(row)) {
      // A null metric is UNMEASURED. Skipping it keeps "we did not measure
      // this" out of history, where a zero would have become a real reading.
      if (metric.value === null) continue;
      samples.push({
        monitoredSourceId: source.id,
        orgId: source.orgId ?? null,
        siteGroupId: source.siteGroupId ?? null,
        siteId: row.SiteUUID ?? null,
        deviceExternalId: row.ApSerial ?? null,
        radioExternalId: row.RadioID != null ? String(row.RadioID) : null,
        wlanExternalId: row.RFSUUID ?? null,
        clientExternalId,
        metricFamily: METRIC_FAMILY,
        metricName: metric.name,
        observedAt,
        bucketStart: null,
        bucketEnd: null,
        numericValue: metric.value,
        numerator: null,
        denominator: null,
        sampleCount: null,
        unit: metric.unit,
        metricKind: 'gauge',
        // Non-identifying radio facts only. A hostname here would defeat the
        // pseudonymisation this collector exists to provide.
        dimensions: {
          band: { 1: '2.4GHz', 2: '5GHz', 3: '6GHz' }[row.RadioID] ?? null,
          protocol: row['11Protocol'] ?? null,
          channel: row.Channel != null ? String(row.Channel) : null,
        },
        qualityState,
        collectedAt: now,
        // NOT NULL in metric_samples, and anchored to the observation for the
        // same reason reportNormalizer does it: keyed on observed_at, retention
        // is a pure rolling window rather than something a late fetch extends.
        expiresAt: new Date(observedAt.getTime() + retentionMs),
      });
    }
  }

  if (skippedPlaceholder) {
    notes.push(`${skippedPlaceholder} idle/placeholder client row(s) skipped rather than scored`);
  }
  if (skippedNoMac) notes.push(`${skippedNoMac} row(s) had no MAC`);
  if (collapsed) {
    notes.push(`${collapsed} duplicate MuTable row(s) collapsed to the freshest per client`);
  }
  if (dropped) {
    notes.push(
      `${dropped} client(s) beyond the ${MAX_CLIENTS_PER_TICK}-client cap were not stored ` +
        '(kept the worst signal first)'
    );
  }

  return {
    samples,
    partialFailures: [],
    cursorAdvances: [],
    notes,
    endpointsTried: ['flex(MuTable)'],
    fatal: null,
  };
}
