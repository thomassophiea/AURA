/**
 * Per-AP energy state collector.
 *
 * One call — `GET /v1/aps/query` — returns the whole fleet with `pwrUsage`, the
 * AP's negotiated PoE draw in watts. That is a MEASURED per-device power figure
 * reported by the hardware, and it is a better energy source than the
 * `ap_report` power timeseries the Energy page integrates today: it needs no
 * per-AP request, it is available at whatever cadence we poll, and it moves
 * within ~30s of a radio change (verified on an AP5020: 14.112 W → 11.868 W
 * after the 6 GHz radio was disabled).
 *
 * Everything lands in `metric_samples` under `metric_family='energy_ap_state'`
 * so it inherits the existing identity index, retention, and site scoping.
 * No second telemetry store exists for this feature.
 *
 * Volume: ~4 series per AP per poll (power, client count, and admin/tx state
 * per radio), which at 8 APs and a 60s cadence is well under the ap_report
 * collector this sits beside.
 */

import { METRIC_FAMILIES } from '../metricRegistry.js';
import { extractRows, normalizeSiteList } from './sleCollector.js';
import { normalizeAp, bandForRadio } from '../../energy/experiment/siteDiscovery.js';

export const COLLECTOR_NAME = 'energy_ap_state';
export const ENERGY_AP_STATE_FAMILY = METRIC_FAMILIES.ENERGY_AP_STATE;

export const METRIC = Object.freeze({
  POWER_WATTS: 'ap.power_watts',
  CLIENT_COUNT: 'ap.client_count',
  RADIO_ADMIN: 'radio.admin_enabled',
  RADIO_TX_POWER: 'radio.tx_power',
  RADIO_CLIENTS: 'radio.clients',
  RADIO_OCCUPANCY: 'radio.channel_occupancy',
});

const MS_PER_DAY = 86_400_000;

/**
 * Turn one controller AP row into metric samples.
 *
 * `observedAt` is the collection instant: `/v1/aps/query` carries no per-field
 * timestamp, so the sample is honestly marked `collection_timestamped` rather
 * than pretending the source supplied the time.
 */
export function samplesForAp(ap, { monitoredSourceId, orgId, siteGroupId, siteId, collectedAt, retentionDays }) {
  const normalized = normalizeAp(ap);
  if (!normalized.serial) return [];

  const observedAt = collectedAt;
  const expiresAt = new Date(collectedAt.getTime() + retentionDays * MS_PER_DAY);
  const base = {
    monitoredSourceId,
    orgId: orgId ?? null,
    siteGroupId: siteGroupId ?? null,
    siteId: siteId ?? null,
    deviceExternalId: normalized.serial,
    metricFamily: ENERGY_AP_STATE_FAMILY,
    observedAt,
    collectedAt,
    expiresAt,
    // The source did not timestamp these values; we did.
    qualityState: 'collection_timestamped',
  };

  // `source: 'measured'` is provenance and it lives in dimensions rather than
  // quality_state so that metric_samples' CHECK constraint — shared with every
  // other family — does not have to be widened for this feature.
  const dims = {
    model: normalized.model ?? null,
    siteName: normalized.siteName ?? null,
    source: 'measured',
  };

  const samples = [];

  // An offline AP reports no draw. Writing 0 would integrate a lie across the
  // outage; writing nothing leaves a gap, which is the truth.
  if (Number.isFinite(normalized.watts) && normalized.status === 'InService') {
    samples.push({
      ...base,
      metricName: METRIC.POWER_WATTS,
      numericValue: normalized.watts,
      unit: 'W',
      metricKind: 'gauge',
      dimensions: { ...dims, status: normalized.status, powerSource: normalized.powerSource },
    });
  }

  samples.push({
    ...base,
    metricName: METRIC.CLIENT_COUNT,
    numericValue: normalized.clientCount,
    unit: 'clients',
    metricKind: 'gauge',
    dimensions: { ...dims, status: normalized.status },
  });

  for (const radio of ap?.radios ?? []) {
    if (radio?.radioIndex == null) continue;
    const radioKey = String(radio.radioIndex);
    const radioDims = { ...dims, band: bandForRadio(radio), mode: radio.mode ?? null };

    // txPower goes to 0 when a radio is administratively down, which is what
    // makes this series the read-back proof that an energy action landed.
    samples.push({
      ...base,
      radioExternalId: radioKey,
      metricName: METRIC.RADIO_TX_POWER,
      numericValue: Number.isFinite(Number(radio.txPower)) ? Number(radio.txPower) : null,
      unit: 'dBm',
      metricKind: 'gauge',
      dimensions: radioDims,
    });
    samples.push({
      ...base,
      radioExternalId: radioKey,
      metricName: METRIC.RADIO_ADMIN,
      // /v1/aps/query does not carry adminState; a radio reporting 0 dBm with
      // no clients is down. Derived, so it is labelled as such.
      numericValue: Number(radio.txPower) > 0 ? 1 : 0,
      unit: 'count',
      metricKind: 'gauge',
      dimensions: { ...radioDims, source: 'derived' },
    });
    samples.push({
      ...base,
      radioExternalId: radioKey,
      metricName: METRIC.RADIO_CLIENTS,
      numericValue: Number(radio.clients) || 0,
      unit: 'clients',
      metricKind: 'gauge',
      dimensions: radioDims,
    });
    if (Number.isFinite(Number(radio.channelOccupancy))) {
      samples.push({
        ...base,
        radioExternalId: radioKey,
        metricName: METRIC.RADIO_OCCUPANCY,
        numericValue: Number(radio.channelOccupancy),
        unit: '%',
        metricKind: 'percentage',
        dimensions: radioDims,
      });
    }
  }

  return samples;
}

/**
 * Collect energy state for every AP the controller knows.
 *
 * @returns {Promise<{samples: object[], partialFailures: object[], notes: string[],
 *                    endpointsTried: number, fatal: object|null}>}
 */
export async function collectEnergyApState({ session, source, config, now = new Date() }) {
  const [apsResp, sitesResp] = await Promise.all([
    session.get('/v1/aps/query'),
    session.get('/v3/sites'),
  ]);

  if (!apsResp.ok) {
    return {
      samples: [],
      partialFailures: [],
      notes: [],
      endpointsTried: 2,
      fatal: {
        errorClass: apsResp.errorClass,
        summary: apsResp.errorSummary,
        status: apsResp.status,
      },
    };
  }

  // Site id resolution is best-effort: without it the sample still records the
  // AP and its site NAME in dimensions, so nothing is lost but the site filter.
  const siteIdByName = new Map();
  if (sitesResp.ok) {
    for (const site of normalizeSiteList(sitesResp.data)) {
      if (site.name) siteIdByName.set(String(site.name).trim(), site.id);
    }
  }

  const apRows = extractRows(apsResp.data, ['aps', 'accessPoints']);
  const samples = [];
  const notes = [];
  let unmapped = 0;

  for (const ap of apRows) {
    const siteName = ap?.hostSite ? String(ap.hostSite).trim() : null;
    const siteId = siteName ? siteIdByName.get(siteName) ?? null : null;
    if (siteName && !siteId) unmapped += 1;
    samples.push(
      ...samplesForAp(ap, {
        monitoredSourceId: source.id,
        orgId: source.orgId,
        siteGroupId: source.siteGroupId,
        siteId,
        collectedAt: now,
        retentionDays: config.retentionDays,
      })
    );
  }

  if (unmapped > 0) {
    notes.push(`${unmapped} AP(s) report a site name that matches no site id; site filtering will miss them.`);
  }
  if (!sitesResp.ok) {
    notes.push('Site list unavailable this tick; energy samples were written without a site id.');
  }

  return { samples, partialFailures: [], notes, endpointsTried: 2, fatal: null };
}
