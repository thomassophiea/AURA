/**
 * Wi-Fi 7 (MLO + AFC) data service.
 *
 * Reads live per-radio AFC / EHT / MLO state from the controller and performs
 * verified writes (GET -> mutate -> PUT -> re-GET) following the ai-first
 * read-back discipline. All traffic flows through configureRequest, inheriting
 * auth, token refresh, dedup, rate-limit backoff and X-Controller-URL routing.
 *
 * Schema source of truth: audit/WIFI7_MLO_AFC_FINDINGS.md.
 * AFC state is per-radio on /v1/aps/{serial}; the /v1/afc/plans route used by
 * the legacy AFCPlanningTool does NOT exist on OS ONE controllers (404).
 */
import { configureRequest, unwrapList } from './configure/resourceClient';
import type { ApDetail, ApRadio } from '../types/configure/ap';
import type {
  AfcRadioUpdate,
  ClientProtocolStat,
  PowerMode6,
  Wifi7Ap,
  Wifi7Band,
  Wifi7Geo,
  Wifi7Radio,
  Wifi7ServiceRef,
  Wifi7Snapshot,
  Wifi7Summary,
  Wifi7WriteResult,
} from '../types/wifi7';
import { POWER_MODE6 } from '../types/wifi7';

const BAND_BY_INDEX: Record<number, Wifi7Band> = { 1: '2.4GHz', 2: '5GHz', 3: '6GHz' };

function bandFor(radio: Pick<ApRadio, 'radioIndex' | 'mode'>): Wifi7Band {
  const byIndex = BAND_BY_INDEX[radio.radioIndex];
  if (byIndex) return byIndex;
  const mode = (radio.mode ?? '').toLowerCase();
  if (mode.startsWith('ax6')) return '6GHz';
  if (mode.startsWith('anc') || mode.startsWith('a')) return '5GHz';
  return '2.4GHz';
}

/** 802.11be capability: the controller appends `be` to the mode of EHT radios. */
export function isEht(mode: string | undefined): boolean {
  return (mode ?? '').trim().toLowerCase().endsWith('be');
}

function widthMhz(channelWidth: string | undefined): number | null {
  const m = /(\d+)\s*MHz/i.exec(channelWidth ?? '');
  return m ? Number(m[1]) : null;
}

/** 802.11be client readiness from the station `protocol` string. */
function protocolIsEht(protocol: string | undefined): boolean {
  return (protocol ?? '').trim().toLowerCase().endsWith('be');
}

function projectRadio(r: ApRadio): Wifi7Radio {
  const band = bandFor(r);
  const eht = isEht(r.mode);
  const pwrMode6 = (r.pwrMode6 ?? 'LPI') as PowerMode6;
  const standardPower = band === '6GHz' && POWER_MODE6[pwrMode6 as PowerMode6]?.standardPower === true;
  const txMaxPower = Number(r.txMaxPower ?? 0);
  const txPower = Number(r.txPower ?? 0);
  const cb = Array.isArray(r.cb) ? r.cb : [];
  return {
    radioIndex: r.radioIndex,
    band,
    mode: r.mode ?? '',
    eht,
    adminState: Boolean(r.adminState),
    opChannel: String(r.opChannel ?? r.channel ?? ''),
    channelWidth: r.channelwidth ?? '',
    channelWidthMhz: widthMhz(r.channelwidth),
    txMaxPower,
    txPower,
    powerCapDb: Math.max(0, txMaxPower - txPower),
    afc: Boolean(r.afc),
    pwrMode6,
    pwrMode6Ovr: Boolean(r.pwrMode6Ovr),
    standardPower,
    mloGrouped: cb.length > 0 || r.cbServiceId != null,
    cbServiceId: r.cbServiceId ?? null,
    boundSsids: (r.wlan ?? []).map((w) => w.ssid).filter(Boolean),
  };
}

function projectAp(ap: ApDetail): Wifi7Ap {
  const radios = (ap.radios ?? []).map(projectRadio);
  const wgs84 = ap.ftm?.wgs84;
  const hasGeo =
    wgs84 != null && (Number(wgs84.latitude) !== 0 || Number(wgs84.longitude) !== 0);
  return {
    serialNumber: ap.serialNumber,
    apName: ap.apName ?? ap.serialNumber,
    model: ap.hardwareType ?? ap.platformName ?? '',
    softwareVersion: ap.softwareVersion ?? '',
    hostSite: ap.hostSite ?? '',
    ehtCapable: radios.some((r) => r.eht),
    radios,
    mloServiceIDs: (ap.mloServiceIDs as string[] | undefined)?.filter?.(Boolean) ?? [],
    geo: hasGeo
      ? { latitude: wgs84.latitude, longitude: wgs84.longitude, altitude: wgs84.altitude }
      : null,
    elevation: ap.elevation
      ? { height: ap.elevation.height, uncertainty: ap.elevation.uncertainty }
      : null,
  };
}

interface RawService {
  id?: string;
  serviceId?: string;
  serviceName?: string;
  name?: string;
}
interface RawStation {
  protocol?: string;
}

async function fetchApDetail(serial: string): Promise<ApDetail | null> {
  try {
    return await configureRequest<ApDetail>(`/v1/aps/${encodeURIComponent(serial)}`);
  } catch {
    return null;
  }
}

/**
 * Build the full Wi-Fi 7 snapshot: every AP's radios (EHT / AFC / power / MLO),
 * the service catalog (for MLO binding), and client 802.11be readiness.
 */
export async function getWifi7Snapshot(): Promise<Wifi7Snapshot> {
  const apList = unwrapList<ApDetail>(await configureRequest<unknown>('/v1/aps'));
  const details = await Promise.all(
    apList.map(async (a) => (await fetchApDetail(a.serialNumber)) ?? a)
  );
  const aps = details.map(projectAp).sort((a, b) => a.apName.localeCompare(b.apName));

  const services: Wifi7ServiceRef[] = unwrapList<RawService>(
    await configureRequest<unknown>('/v1/services').catch(() => [])
  )
    .map((s) => ({ id: s.id ?? s.serviceId ?? '', name: s.serviceName ?? s.name ?? '(unnamed)' }))
    .filter((s) => s.id);

  const stations = unwrapList<RawStation>(
    await configureRequest<unknown>('/v1/stations').catch(() => [])
  );
  const protoMap = new Map<string, number>();
  for (const s of stations) {
    const p = (s.protocol ?? 'unknown').trim() || 'unknown';
    protoMap.set(p, (protoMap.get(p) ?? 0) + 1);
  }
  const clientProtocols: ClientProtocolStat[] = [...protoMap.entries()]
    .map(([protocol, count]) => ({ protocol, count, eht: protocolIsEht(protocol) }))
    .sort((a, b) => b.count - a.count);

  const allRadios = aps.flatMap((a) => a.radios);
  const summary: Wifi7Summary = {
    totalAps: aps.length,
    ehtAps: aps.filter((a) => a.ehtCapable).length,
    ehtRadios: allRadios.filter((r) => r.eht).length,
    afcRadios: allRadios.filter((r) => r.afc).length,
    standardPowerRadios: allRadios.filter((r) => r.standardPower).length,
    mloConfiguredAps: aps.filter((a) => a.mloServiceIDs.length > 0).length,
    totalClients: stations.length,
    ehtClients: clientProtocols.filter((c) => c.eht).reduce((n, c) => n + c.count, 0),
  };

  const notes: string[] = [];
  if (summary.ehtClients === 0 && summary.totalClients > 0) {
    notes.push(
      'No 802.11be (Wi-Fi 7) clients are currently associated — MLO link telemetry will populate once EHT clients connect.'
    );
  }
  notes.push(
    'This controller API exposes single-link station data only (no MLD / affiliated-link RSSI). MLO is shown as configured link capability, not per-link runtime metrics.'
  );

  return { aps, services, clientProtocols, summary, fetchedAt: Date.now(), notes };
}

/** GET the full AP body, apply a mutation, PUT it back, then re-GET to verify. */
async function verifiedApWrite(
  serial: string,
  mutate: (ap: ApDetail) => void,
  verify: (after: ApDetail) => { ok: boolean; detail: string; applied?: Record<string, unknown> }
): Promise<Wifi7WriteResult> {
  const ap = await configureRequest<ApDetail>(`/v1/aps/${encodeURIComponent(serial)}`);
  mutate(ap);
  await configureRequest<ApDetail>(`/v1/aps/${encodeURIComponent(serial)}`, {
    method: 'PUT',
    body: ap,
  });
  const after = await configureRequest<ApDetail>(`/v1/aps/${encodeURIComponent(serial)}`);
  const result = verify(after);
  return { serialNumber: serial, ...result };
}

/** Enable/disable AFC and/or set the 6 GHz power mode on one radio, with read-back. */
export async function updateRadioAfc(
  serial: string,
  radioIndex: number,
  update: AfcRadioUpdate
): Promise<Wifi7WriteResult> {
  return verifiedApWrite(
    serial,
    (ap) => {
      const radio = ap.radios?.find((r) => r.radioIndex === radioIndex);
      if (!radio) throw new Error(`Radio ${radioIndex} not found on ${serial}`);
      if (update.afc !== undefined) radio.afc = update.afc;
      if (update.pwrMode6 !== undefined) {
        radio.pwrMode6 = update.pwrMode6;
        radio.pwrMode6Ovr = true;
      }
    },
    (after) => {
      const r = after.radios?.find((x) => x.radioIndex === radioIndex);
      const afcOk = update.afc === undefined || r?.afc === update.afc;
      const pwrOk = update.pwrMode6 === undefined || r?.pwrMode6 === update.pwrMode6;
      const ok = Boolean(r) && afcOk && pwrOk;
      return {
        ok,
        detail: ok
          ? `Radio ${radioIndex}: AFC=${r?.afc}, power mode=${r?.pwrMode6} (verified on controller)`
          : `Controller did not persist the change (silent drop). Now: AFC=${r?.afc}, power mode=${r?.pwrMode6}`,
        applied: { afc: r?.afc, pwrMode6: r?.pwrMode6, txPower: r?.txPower, txMaxPower: r?.txMaxPower },
      };
    }
  );
}

/** Replace the AP's MLO service grouping, with read-back. */
export async function updateApMlo(
  serial: string,
  mloServiceIDs: string[]
): Promise<Wifi7WriteResult> {
  return verifiedApWrite(
    serial,
    (ap) => {
      ap.mloServiceIDs = mloServiceIDs;
    },
    (after) => {
      const now = ((after.mloServiceIDs as string[]) ?? []).slice().sort();
      const want = mloServiceIDs.slice().sort();
      const ok = now.length === want.length && now.every((v, i) => v === want[i]);
      return {
        ok,
        detail: ok
          ? `MLO grouping set to ${now.length} service(s) (verified on controller)`
          : `Controller did not persist MLO grouping. Now: [${now.join(', ')}]`,
        applied: { mloServiceIDs: now },
      };
    }
  );
}

/** Set the AP WGS84 geolocation (required for AFC Standard Power), with read-back. */
export async function updateApGeo(serial: string, geo: Wifi7Geo): Promise<Wifi7WriteResult> {
  return verifiedApWrite(
    serial,
    (ap) => {
      ap.ftm = ap.ftm ?? {
        wgs84: { latitude: 0, longitude: 0, altitude: 0 },
        wgs84Ovr: true,
        zSubelement: {
          expectedToMove: false,
          floorNumber: 0,
          aboveFloor: { height: 0, uncertainty: 0 },
        },
        civicAddress: { addr: '', ovr: false },
      };
      ap.ftm.wgs84 = { latitude: geo.latitude, longitude: geo.longitude, altitude: geo.altitude };
      ap.ftm.wgs84Ovr = true;
    },
    (after) => {
      const w = after.ftm?.wgs84;
      const ok =
        w != null &&
        Number(w.latitude) === geo.latitude &&
        Number(w.longitude) === geo.longitude;
      return {
        ok,
        detail: ok
          ? `Geolocation set to ${geo.latitude}, ${geo.longitude} (verified on controller)`
          : 'Controller did not persist geolocation.',
        applied: { wgs84: w },
      };
    }
  );
}
