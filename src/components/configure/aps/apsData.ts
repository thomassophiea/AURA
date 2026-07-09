/**
 * Data access for the Access Points page. The committed foundation shipped
 * `adoptionService` (the registration singleton) but no AP collection service,
 * so this thin module rides the shared `configureRequest` (auth / proxy /
 * dedup inherited from apiService) for the three operations the editor needs:
 *
 *   - list()   GET  /v1/aps/query   (carries per-AP status the plain list omits)
 *   - get()    GET  /v1/aps/{serial} (full per-AP override document, ApDetail)
 *   - update() PUT  /v1/aps/{serial}
 *   - create() POST /v1/aps          (New AP registration)
 *   - remove() DELETE /v1/aps/{serial}
 *
 * Kept under components/configure/aps per the port's write-scope; it is a data
 * helper, not a change to the shared services tree.
 */
import { configureRequest, unwrapList } from '../../../services/configure';
import type { ApDetail } from '../../../types/configure';

/** Summary row returned by /v1/aps[/query] — a subset of the full ApDetail. */
export interface ApListRow {
  serialNumber: string;
  apName?: string;
  hostname?: string;
  macAddress?: string;
  hardwareType?: string;
  platformName?: string;
  ipAddress?: string;
  softwareVersion?: string;
  hostSite?: string;
  environment?: string;
  proxied?: string;
  ovr?: boolean;
  adoptedBy?: string;
  approvedStatus?: string;
  /** Live status hints; presence varies by controller version. */
  status?: string;
  active?: boolean;
  connected?: boolean;
  canDelete?: boolean;
  canEdit?: boolean;
  radios?: Array<{
    radioName?: string;
    radioIndex: number;
    mode?: string;
    channel?: string | number | null;
    opChannel?: string;
    channelwidth?: string;
    txPower?: number;
    afc?: boolean;
    pwrMode6?: string;
  }>;
}

export const apsData = {
  async list(): Promise<ApListRow[]> {
    const payload = await configureRequest<unknown>('/v1/aps/query');
    return unwrapList<ApListRow>(payload);
  },

  async get(serialNumber: string): Promise<ApDetail> {
    return configureRequest<ApDetail>(`/v1/aps/${encodeURIComponent(serialNumber)}`);
  },

  async update(serialNumber: string, payload: Partial<ApDetail>): Promise<ApDetail> {
    return configureRequest<ApDetail>(`/v1/aps/${encodeURIComponent(serialNumber)}`, {
      method: 'PUT',
      body: payload,
    });
  },

  async create(payload: Partial<ApDetail>): Promise<ApDetail> {
    return configureRequest<ApDetail>('/v1/aps', { method: 'POST', body: payload });
  },

  async remove(serialNumber: string): Promise<void> {
    await configureRequest<void>(`/v1/aps/${encodeURIComponent(serialNumber)}`, {
      method: 'DELETE',
    });
  },
};

/** Online/offline hint from a list row's tolerant status fields (gap 25). */
export function apOnlineState(row: ApListRow): 'online' | 'offline' | 'unknown' {
  if (row.active === true || row.connected === true) return 'online';
  if (row.active === false || row.connected === false) return 'offline';
  const s = (row.status ?? '').toLowerCase();
  if (!s) return 'unknown';
  if (['up', 'online', 'active', 'connected', 'normal', 'inservice'].some((k) => s.includes(k))) {
    return 'online';
  }
  if (['down', 'offline', 'inactive', 'disconnected'].some((k) => s.includes(k))) {
    return 'offline';
  }
  return 'unknown';
}
