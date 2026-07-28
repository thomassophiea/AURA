/**
 * Site AFC + Geo-Diagnostics projections — pure, framework-free. Turns the raw
 * per-AP config records (`GET /v1/aps/{serial}`) belonging to a site into the
 * AFC grid rows, the per-floor Geo-Diagnostics rollup and the three summary
 * card tallies the controller's Site → Access Points → AFC view shows.
 *
 * Schema source of truth: audit/SITE_AFC_GEO_FINDINGS.md and
 * audit/WIFI7_MLO_AFC_FINDINGS.md. AFC *runtime* status (AFC Available, Expire,
 * Subgraph, donut states) is NOT in the config API — every candidate endpoint
 * 404s — so this module derives an AFC *eligibility* signal from config only.
 */
import type { ApDetail } from '../../../types/configure';
import { apBandOf } from '../aps/apHelpers';
import { projectApRadio } from '../../wifi7/wifi7Model';
import type { Wifi7Radio } from '../../../types/wifi7';

/** Config-derived AFC eligibility — not the controller's live runtime status. */
export type AfcStatus = 'SP Eligible' | 'LPI' | 'Not Eligible' | 'No 6 GHz';

/** One row of the per-AP AFC grid (columns mirror the controller UI). */
export interface AfcApRow {
  serialNumber: string;
  apName: string;
  model: string;
  radioIndex: number | null;
  /** Anchor Type — 'GPS' when the AP is a GPS anchor, else '—'. */
  anchorType: string;
  gpsAntennaDistance: number | null;
  /** Formatted "lat, lon" or 'Not set' when the AP has no WGS-84 fix. */
  geoLocation: string;
  hasGeo: boolean;
  /** Raw pwrMode6 enum (feeds PowerModeBadge). */
  powerMode: string;
  channel: string;
  fallbackChannel: string;
  power: number | null;
  reqPower: number | null;
  powerCapDb: number;
  floor: number | null;
  afcEnabled: boolean;
  status: AfcStatus;
  /** Projected 6 GHz radio for AfcPowerBar/PowerModeBadge; null when absent. */
  radio: Wifi7Radio | null;
}

function fmtCoord(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

function joinFallback(fallback: unknown[] | undefined): string {
  if (!Array.isArray(fallback) || fallback.length === 0) return '—';
  return fallback.map((c) => String(c)).join(', ');
}

/** Project one AP config record into an AFC grid row (uses its 6 GHz radio). */
export function projectAfcApRow(ap: ApDetail): AfcApRow {
  const r6 = (ap.radios ?? []).find((r) => apBandOf(r) === 'Band6');
  const radio = r6 ? projectApRadio(r6) : null;
  const wgs = ap.ftm?.wgs84;
  const lat = Number(wgs?.latitude ?? 0);
  const lon = Number(wgs?.longitude ?? 0);
  const hasGeo = lat !== 0 || lon !== 0;
  const floor = ap.ftm?.zSubelement?.floorNumber ?? null;

  const afcEnabled = Boolean(r6?.afc);
  const isAnchor = Boolean(ap.gpsAnchor);

  let status: AfcStatus;
  if (!r6) {
    status = 'No 6 GHz';
  } else if (afcEnabled && isAnchor && radio?.standardPower) {
    status = 'SP Eligible';
  } else if (radio?.standardPower || r6.pwrMode6 === 'LPI') {
    status = 'LPI';
  } else {
    status = 'Not Eligible';
  }

  return {
    serialNumber: ap.serialNumber,
    apName: ap.apName || ap.serialNumber,
    model: ap.hardwareType || '—',
    radioIndex: r6?.radioIndex ?? null,
    anchorType: isAnchor ? 'GPS' : '—',
    gpsAntennaDistance: isAnchor ? (ap.gpsAntennaDistance ?? null) : null,
    geoLocation: hasGeo ? fmtCoord(lat, lon) : 'Not set',
    hasGeo,
    powerMode: r6?.pwrMode6 ?? '',
    channel: radio?.opChannel || '—',
    fallbackChannel: joinFallback(r6?.fallbackChannels as unknown[] | undefined),
    power: radio ? radio.txPower : null,
    reqPower: radio ? radio.txMaxPower : null,
    powerCapDb: radio?.powerCapDb ?? 0,
    floor,
    afcEnabled,
    status,
    radio,
  };
}

/** One row of the Geo-Diagnostics grid — one line per floor. */
export interface GeoFloorRow {
  floorNumber: number;
  floorLabel: string;
  apCount: number;
  anchorApCount: number;
  ftmRangingApCount: number;
}

/**
 * Per-floor rollup from per-AP gpsAnchor + geolocation + floorNumber. FTM
 * ranging participation is gated on the site-level `apRanging` flag (there is
 * no per-AP ranging flag in the config API) — an AP counts as a ranging
 * participant when ranging is enabled site-wide and it has a WGS-84 fix.
 */
export function buildGeoDiagnostics(aps: ApDetail[], apRanging: boolean): GeoFloorRow[] {
  const byFloor = new Map<number, GeoFloorRow>();
  for (const ap of aps) {
    const floor = ap.ftm?.zSubelement?.floorNumber ?? 0;
    const wgs = ap.ftm?.wgs84;
    const hasGeo = Number(wgs?.latitude ?? 0) !== 0 || Number(wgs?.longitude ?? 0) !== 0;
    const row =
      byFloor.get(floor) ??
      {
        floorNumber: floor,
        floorLabel: floor > 0 ? `Floor ${floor}` : 'Unassigned',
        apCount: 0,
        anchorApCount: 0,
        ftmRangingApCount: 0,
      };
    row.apCount += 1;
    if (ap.gpsAnchor) row.anchorApCount += 1;
    if (apRanging && hasGeo) row.ftmRangingApCount += 1;
    byFloor.set(floor, row);
  }
  return [...byFloor.values()].sort((a, b) => a.floorNumber - b.floorNumber);
}

/** Tallies backing the three AFC summary cards. */
export interface AfcSummary {
  totalAps: number;
  apsWithGeo: number;
  anchorAps: number;
  afcRadios: number;
  spEligibleRadios: number;
  spRadios: number;
  cappedRadios: number;
  apRanging: boolean;
}

export function buildAfcSummary(rows: AfcApRow[], apRanging: boolean): AfcSummary {
  return {
    totalAps: rows.length,
    apsWithGeo: rows.filter((r) => r.hasGeo).length,
    anchorAps: rows.filter((r) => r.anchorType === 'GPS').length,
    afcRadios: rows.filter((r) => r.afcEnabled).length,
    spEligibleRadios: rows.filter((r) => r.status === 'SP Eligible').length,
    spRadios: rows.filter((r) => r.radio?.standardPower).length,
    cappedRadios: rows.filter((r) => r.powerCapDb > 0).length,
    apRanging,
  };
}

/** Badge variant for an AfcStatus (maps to ui/badge variants). */
export function afcStatusVariant(status: AfcStatus): 'success' | 'info' | 'secondary' | 'outline' {
  switch (status) {
    case 'SP Eligible':
      return 'success';
    case 'LPI':
      return 'info';
    case 'Not Eligible':
      return 'secondary';
    default:
      return 'outline';
  }
}
