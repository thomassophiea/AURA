/**
 * Gateway evidence layer — the measured route to client and RF telemetry.
 *
 * WHY THIS EXISTS
 * ---------------
 * The original Cortex tool catalog was written against endpoints that do not
 * carry the data it claimed. Probed against the lab Gateway (VE6120,
 * 10.20.1.0-020R, 2026-09-10):
 *
 *   /v1/stations/events/{mac}   500 "This feature is disabled."  <- hard dead
 *   /v1/auditlogs               422 unless startTime+endTime (epoch ms)
 *   /v1/aps/ifstats             partial: 200 fleet-wide, 500 for some APs
 *   /v3/sites/{id}/report/impact 404 despite being in the spec
 *   siteQoE / apQoE             "enable": false, empty tables
 *
 * What *does* carry it, verified in real calls:
 *
 *   flex("MuTable")   85 columns of per-client, per-sample telemetry
 *   flex("ApTable")   34 columns of per-radio airtime, noise, power
 *   report(station, mac, ["muEvent", "baselining*"])  the client timeline
 *                     and the Gateway's own learned baseline envelope
 *
 * Flex frames arrive base64(zlib(json)). The report API accepts ONE duration
 * on this build — '3H'; every other value 500s after ~31s.
 *
 * SENTINELS
 * ---------
 * This is the half that stops a diagnostic tool inventing outages. The Gateway
 * uses in-band magic numbers for "not measured", and read naively they look
 * like catastrophic readings:
 *
 *   RTT columns  = 65535   -> not measured (NOT 65-second latency)
 *   SNR          = -10000  -> placeholder on an idle/unassociated row
 *   Rss          = 0       -> placeholder, not a perfect signal
 *   Noise        = 0       -> radio is off, not a silent noise floor
 *   DLRetryAttempts        -> 0 for every client on this build; use loss
 *
 * Every accessor here returns `null` for an unmeasured value rather than a
 * number, so an absent reading can never be scored, averaged or reported as a
 * fact. `null` means "we do not know", and callers must render it as unknown.
 */

import zlib from 'node:zlib';

/** The only duration the report API accepts on 10.20.x. Anything else -> 500. */
export const REPORT_DURATION = '3H';

/** Radio slot -> band. Matches radioIfList indexing used everywhere else. */
export const RADIO_BAND = { 1: '2.4GHz', 2: '5GHz', 3: '6GHz' };

/** In-band "not measured" marker used by every RTT column. */
const RTT_SENTINEL = 65535;
/** Placeholder SNR on rows for clients that are not really associated. */
const SNR_SENTINEL = -10000;

/**
 * Normalise a round-trip-time reading.
 * @returns {number|null} milliseconds, or null when the Gateway did not measure it.
 */
export function rtt(value) {
  if (value === null || value === undefined) return null;
  // Number('') and Number([]) are both 0, so a coercion-only check turns an
  // ABSENT reading into "0 ms" — a fabricated measurement of exactly the kind
  // this function exists to prevent. Accept only real numbers and numeric
  // strings that actually contain a digit.
  if (typeof value === 'string') {
    if (!/^-?\d+(\.\d+)?$/.test(value.trim())) return null;
  } else if (typeof value !== 'number') {
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  // 65535 is "not measured". Values at or above it are equally meaningless,
  // and a real RTT never legitimately reaches 65 seconds on a WLAN.
  if (n >= RTT_SENTINEL || n < 0) return null;
  return n;
}

/**
 * Normalise a signal reading. Rss 0 and SNR -10000 are placeholders that
 * appear on idle rows; scoring them produces phantom incidents.
 * @returns {{rss: number|null, snr: number|null}}
 */
export function signal(row) {
  const rawRss = Number(row?.Rss);
  const rawSnr = Number(row?.SNR);
  const rss = Number.isFinite(rawRss) && rawRss !== 0 && rawRss < 0 ? rawRss : null;
  const snr = Number.isFinite(rawSnr) && rawSnr !== SNR_SENTINEL && rawSnr > -100 ? rawSnr : null;
  return { rss, snr };
}

/**
 * A MuTable row is a real, associated client worth scoring only if it carries
 * a usable signal reading. Idle/stale rows persist in the table with
 * placeholder values and must be counted separately, never diagnosed.
 */
export function isScorableClientRow(row) {
  const { rss, snr } = signal(row);
  return rss !== null && snr !== null;
}

/**
 * Noise floor. `Noise === 0` means the radio is off, not that the band is quiet.
 * @returns {number|null}
 */
export function noiseFloor(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

/** Inflate one flex frame: base64 -> zlib -> JSON. Empty tables inflate to '[]'. */
export function inflateFrame(frameB64) {
  const buf = Buffer.from(frameB64, 'base64');
  const raw = zlib.inflateSync(buf);
  const text = raw.toString('utf8');
  if (!text) return [];
  return JSON.parse(text);
}

/**
 * Decode a flex response body into flat rows.
 * The body is an array of `{ frame: <base64 zlib json> }`.
 */
export function decodeFlexBody(body) {
  if (!Array.isArray(body)) return [];
  const rows = [];
  for (const frame of body) {
    if (frame && typeof frame === 'object' && frame.frame) {
      const decoded = inflateFrame(frame.frame);
      if (Array.isArray(decoded)) rows.push(...decoded);
    }
  }
  return rows;
}

/** Build the flex query path for a table key over a trailing window. */
export function flexPath(key, { hours = 3, bin = '3H', now = Date.now() } = {}) {
  const query = {
    key,
    format: 'Json',
    start: now - Math.round(hours * 3600 * 1000),
    end: now,
  };
  return `/v1/report/flex/${bin}?query=${encodeURIComponent(JSON.stringify(query))}`;
}

/** Build a report-widget path. `kind` is 'ap' | 'station' | 'site'. */
export function reportPath(kind, ident, widgets) {
  const base = {
    ap: `/v1/aps/${encodeURIComponent(ident)}/report`,
    station: `/v1/stations/${encodeURIComponent(ident)}/report`,
    site: `/v1/report/sites/${encodeURIComponent(ident)}`,
  }[kind];
  if (!base) throw new Error(`Unknown report kind: ${kind}`);
  return `${base}?duration=${REPORT_DURATION}&widgetList=${widgets.map(encodeURIComponent).join(',')}`;
}

/**
 * Audit logs require BOTH startTime and endTime as epoch milliseconds.
 * Omitting them, or using start/end or fromTime/toTime, returns
 * 422 "Validation failed; Invalid end time." — measured.
 */
export function auditLogPath({ hours = 24, now = Date.now() } = {}) {
  const start = now - Math.round(hours * 3600 * 1000);
  return `/v1/auditlogs?startTime=${start}&endTime=${now}`;
}

/**
 * Pull numeric points out of a report widget's time series.
 * @returns {{values: number[], meta: object}}
 */
export function widgetSeries(report, widget, statName = null) {
  const blocks = report && typeof report === 'object' ? report[widget] : null;
  if (!blocks) return { values: [], meta: {} };
  const block = Array.isArray(blocks) ? blocks[0] : blocks;
  if (!block) return { values: [], meta: {} };
  const stats = block.statistics ?? [];
  const chosen = statName === null ? stats[0] : stats.find((s) => s.statName === statName);
  if (!chosen) return { values: [], meta: { reportName: block.reportName } };
  const values = [];
  for (const point of chosen.values ?? []) {
    const raw = point?.value;
    if (raw === null || raw === undefined || raw === 'null' || raw === '') continue;
    const n = Number(raw);
    if (Number.isFinite(n)) values.push(n);
  }
  return {
    values,
    meta: {
      reportName: block.reportName,
      unit: block.unit ?? chosen.unit,
      statName: chosen.statName,
    },
  };
}

/**
 * Flatten an event widget into structured events.
 * `muEvent` is the ONLY working per-client event source on this build —
 * /v1/stations/events/{mac} answers 500 "This feature is disabled."
 *
 * statNames observed on 10.20.x: Association, Disassociation, Roaming,
 * "Auth Problem".
 *
 * @returns {Array<{type: string, timestamp: number|null, apName?: string,
 *                  ssid?: string, details?: string, fastTransition?: string|null}>}
 */
export function widgetEvents(report, widget = 'muEvent') {
  const out = [];
  const blocks = report && typeof report === 'object' ? report[widget] : null;
  for (const block of blocks ?? []) {
    for (const stat of block?.statistics ?? []) {
      for (const point of stat?.values ?? []) {
        const msg = point?.msg ?? {};
        // The per-event Timestamp inside msg is more precise than the bucket
        // timestamp on the point, so prefer it when present.
        const inner = Number(msg.Timestamp);
        const bucket = Number(point?.timestamp);
        const ts = Number.isFinite(inner)
          ? inner
          : Number.isFinite(bucket)
            ? bucket
            : null;
        out.push({
          type: stat.statName,
          timestamp: ts,
          apName: msg.ApName,
          ssid: msg.SSID,
          details: msg.Details,
          fastTransition: parseFastTransition(msg.Details),
        });
      }
    }
  }
  out.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  return out;
}

/**
 * Extract the FT state from a roam/association Details string.
 * `FT[None]` means the roam did not use fast transition, so it cost a full
 * re-auth. Returns null when the field is absent rather than guessing.
 */
export function parseFastTransition(details) {
  if (typeof details !== 'string') return null;
  const m = details.match(/FT\[([^\]]*)\]/);
  return m ? m[1] : null;
}

/**
 * Extract the radio pair out of a roam Details string, e.g.
 * "Inside XIQC from AP/Radio[1] to AP/Radio[2] ...".
 * The controller emits the literal string "XIQC" here — match on it, do not
 * "correct" it to Gateway.
 * @returns {{from: number, to: number, interband: boolean}|null}
 */
export function parseRoamRadios(details) {
  if (typeof details !== 'string') return null;
  const m = details.match(/Radio\[(\d+)\]\s+to\s+AP\/Radio\[(\d+)\]/);
  if (!m) return null;
  const from = Number(m[1]);
  const to = Number(m[2]);
  return { from, to, interband: from !== to };
}

/** Percentile without a numeric dependency. */
export function percentile(values, p) {
  if (!values?.length) return null;
  const xs = [...values].sort((a, b) => a - b);
  const k = (xs.length - 1) * (p / 100);
  const lo = Math.floor(k);
  const hi = Math.min(lo + 1, xs.length - 1);
  return xs[lo] + (xs[hi] - xs[lo]) * (k - lo);
}

/**
 * The airtime split for one ApTable radio row. The four shares sum to 100 and
 * that identity is what makes the co-channel attribution trustworthy:
 *   available + clientData + interference + ChannelUtilizationAdjusted = 100
 *
 * `clientData`  our own clients' airtime
 * `Adjusted`    the co-channel share (other Wi-Fi on this channel)
 * `interference` the non-Wi-Fi share
 */
/**
 * The 32 per-application byte counters MuTable carries (verified 2026-09-11;
 * 33 App* columns in all, of which AppLastUpdate is a timestamp, not a counter.
 * 85 MuTable columns total). Nothing read them before, which left no way to separate
 * "the network is broken" from "the network is busy" -- the most common
 * misdiagnosis once the backend is ruled out.
 */
export const APP_COLUMNS = [
  'AppAdvertising', 'AppBusinessApplications', 'AppCertificateValidation',
  'AppCloudComputing', 'AppCloudStorage', 'AppCorporateWebsite', 'AppDatabases',
  'AppE-commerce', 'AppEducation', 'AppFinance', 'AppGames', 'AppHealth',
  'AppLocationServices', 'AppMail', 'AppNewsandInformation', 'AppPeertoPeer',
  'AppProtocols', 'AppRealTimeandCloudCommunications', 'AppRestrictedContent',
  'AppSearchEngines', 'AppSocialNetworking', 'AppSoftwareUpdates', 'AppSports',
  'AppStorage', 'AppStreaming', 'AppTravel', 'AppUnknownApps',
  'AppVPNandSecurity', 'AppWebApplications', 'AppWebCollaboration',
  'AppWebContentServices', 'AppWebFileSharing',
];

/** Categories that are a policy observation rather than a performance one. */
export const POLICY_APP_COLUMNS = new Set([
  'AppPeertoPeer', 'AppRestrictedContent', 'AppGames',
]);

/** 'AppRealTimeandCloudCommunications' -> 'RealTime and Cloud Communications' */
export function appLabel(column) {
  return String(column)
    .replace(/^App/, '')
    // Split camel boundaries, then rescue the run-together conjunction in
    // names like RealTimeandCloudCommunications -> "RealTime and Cloud ...".
    .replace(/and(?=[A-Z])/g, ' and ')
    .replace(/(?<=[a-z])(?=[A-Z])/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Per-application byte breakdown for one MuTable row.
 *
 * Demand is not impairment: a client with healthy RF moving 4 GB of
 * AppStreaming is the network working. Returns null when the row carries no
 * counters at all, rather than a fabricated zero mix.
 *
 * @returns {{totalBytes: number, top: Array<{app: string, label: string,
 *   bytes: number, share: number}>, policy: Array<{app: string, bytes: number}>}|null}
 */
export function appDemand(row) {
  if (!row || typeof row !== 'object') return null;
  const vals = [];
  for (const col of APP_COLUMNS) {
    const v = Number(row[col]);
    if (Number.isFinite(v) && v > 0) vals.push([col, v]);
  }
  const totalBytes = vals.reduce((a, [, v]) => a + v, 0);
  if (totalBytes <= 0) return null;
  vals.sort((a, b) => b[1] - a[1]);
  return {
    totalBytes,
    top: vals.slice(0, 5).map(([app, bytes]) => ({
      app, label: appLabel(app), bytes, share: bytes / totalBytes,
    })),
    policy: vals
      .filter(([app]) => POLICY_APP_COLUMNS.has(app))
      .map(([app, bytes]) => ({ app, label: appLabel(app), bytes })),
  };
}

/**
 * Why an AP tunnel's MTU does not agree with the Gateway, or null when it does.
 *
 * MTU mismatch is the one backend cause with no symptom anywhere else in this
 * evidence set: association succeeds, small packets succeed, TLS and large
 * transfers fail, and the RF reads perfect.
 */
export function mtuMismatchReason(tunnel) {
  if (!tunnel || typeof tunnel !== 'object') return null;
  const cfg = Number(tunnel.configMtu);
  const learned = Number(tunnel.apLearnedMtu);
  if (Number.isFinite(cfg) && Number.isFinite(learned) && learned > 0 && learned < cfg) {
    return `configMtu ${cfg} but the AP learned ${learned}`;
  }
  const mtuState = tunnel.configMtuTunnelStatus;
  if (mtuState && String(mtuState) !== 'Normal') {
    return `configMtuTunnelStatus=${mtuState}`;
  }
  const mgmt = tunnel.internalManagementTunnelStatus;
  if (mgmt && String(mgmt) !== 'Normal') {
    return `internalManagementTunnelStatus=${mgmt}`;
  }
  return null;
}

export function airtimeSplit(row) {
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const split = {
    utilization: num(row?.ChannelUtilization),
    ownClients: num(row?.clientData),
    coChannel: num(row?.ChannelUtilizationAdjusted),
    nonWifi: num(row?.interference),
    available: num(row?.available),
    noise: noiseFloor(row?.Noise),
  };
  const parts = [split.ownClients, split.coChannel, split.nonWifi, split.available];
  split.consistent =
    parts.every((v) => v !== null) &&
    Math.abs(parts.reduce((a, b) => a + b, 0) - 100) <= 2;
  return split;
}

/**
 * A GatewayEvidence reader bound to one controller session.
 *
 * Takes anything with `get(path) -> {ok, status, data, errorSummary}` — i.e.
 * AURA's existing ControllerSession — so this layer inherits its auth,
 * token refresh, 401-retry and TLS posture instead of re-implementing them.
 */
export class GatewayEvidence {
  #session;
  #timeoutNote;

  constructor(session) {
    if (!session || typeof session.get !== 'function') {
      throw new Error('GatewayEvidence requires a session with a get(path) method');
    }
    this.#session = session;
    this.#timeoutNote = null;
  }

  /**
   * Read a flex telemetry table.
   * @returns {Promise<{ok: boolean, rows: object[], error: string|null}>}
   */
  async flex(key, options = {}) {
    const result = await this.#session.get(flexPath(key, options));
    if (!result.ok) {
      return { ok: false, rows: [], error: result.errorSummary ?? `HTTP ${result.status}` };
    }
    try {
      return { ok: true, rows: decodeFlexBody(result.data), error: null };
    } catch (err) {
      // A frame that will not inflate is a real failure, not an empty table —
      // surface it rather than returning [] and letting a caller read that as
      // "nothing is wrong".
      return { ok: false, rows: [], error: `flex ${key} decode failed: ${err.message}` };
    }
  }

  /** Read report widgets for an AP, client (station) or site. */
  async report(kind, ident, widgets) {
    const result = await this.#session.get(reportPath(kind, ident, widgets));
    if (!result.ok) {
      return { ok: false, data: null, error: result.errorSummary ?? `HTTP ${result.status}` };
    }
    return { ok: true, data: result.data, error: null };
  }

  /** Per-client telemetry rows (MuTable). */
  async clients(options = {}) {
    return this.flex('MuTable', options);
  }

  /** Per-radio RF rows (ApTable) — the working replacement for ifstats. */
  async radios(options = {}) {
    return this.flex('ApTable', options);
  }

  /** Neighbour/interference-source rows. Large; give it room. */
  async neighbours(options = {}) {
    return this.flex('SmartRfNeighborTable', options);
  }

  /**
   * The client event timeline. muEvent only — the REST events route is
   * disabled on this build.
   */
  async clientTimeline(mac) {
    const res = await this.report('station', mac, ['muEvent']);
    if (!res.ok) return { ok: false, events: [], error: res.error };
    return { ok: true, events: widgetEvents(res.data, 'muEvent'), error: null };
  }

  /**
   * The Gateway's own learned baseline envelope for a client. A value outside
   * its own band is the Gateway saying "this is not normal *here*", which is a
   * better anomaly signal than any global threshold we could invent.
   */
  async clientBaselines(mac) {
    const widgets = [
      'baseliningRss',
      'baseliningRFQI',
      'baseliningWirelessRTT',
      'baseliningNetworkRTT',
    ];
    const res = await this.report('station', mac, widgets);
    if (!res.ok) return { ok: false, baselines: {}, error: res.error };
    const baselines = {};
    for (const w of widgets) {
      const { values, meta } = widgetSeries(res.data, w);
      baselines[w] = { values, meta, median: percentile(values, 50) };
    }
    return { ok: true, baselines, error: null };
  }

  /** Configuration audit log over a window, with the params it actually needs. */
  async auditLogs(options = {}) {
    const result = await this.#session.get(auditLogPath(options));
    if (!result.ok) {
      return { ok: false, entries: [], error: result.errorSummary ?? `HTTP ${result.status}` };
    }
    const rows = Array.isArray(result.data) ? result.data : [];
    return { ok: true, entries: rows, error: null };
  }
}
