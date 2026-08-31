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
 * AP trace (Advanced Settings > Actions) — contract recovered from the
 * gateway's own UI (ap-controller `logs()`/`showTraces()` + device-data-factory):
 *   - retrieveTrace()    PUT /v1/aps/{serial}/logs, body = the AP document
 *                        (asks the AP to upload its trace archive to the
 *                        Gateway; wired per controller spec, not live-fired —
 *                        the GET probe of the path returns 405, confirming
 *                        the route exists for another verb)
 *   - listTraceFiles()   GET /v1/aps/{serial}/traceurls -> [fileName, ...]
 *                        (404 = no trace archive yet; verified live)
 *   - downloadTraceFiles() GET /v1/aps/downloadtrace/{file[,file...]} as an
 *                        application/tar blob (the gateway comma-joins every
 *                        file returned by traceurls into one request)
 *
 * Kept under components/configure/aps per the port's write-scope; it is a data
 * helper, not a change to the shared services tree.
 */
import { ConfigureApiError, configureRequest, unwrapList } from '../../../services/configure';
import { apiService } from '../../../services/api';
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

  /**
   * Ask the AP to upload its trace archive to the Gateway. Wired per
   * controller spec (gateway UI: PUT aps/{serial}/logs with the AP document
   * as the body), not live-fired.
   */
  async retrieveTrace(serialNumber: string, ap: ApDetail): Promise<void> {
    await configureRequest<void>(`/v1/aps/${encodeURIComponent(serialNumber)}/logs`, {
      method: 'PUT',
      body: ap,
    });
  },

  /** Trace archive file names on the Gateway; 404 means none retrieved yet. */
  async listTraceFiles(serialNumber: string): Promise<string[]> {
    try {
      const payload = await configureRequest<unknown>(
        `/v1/aps/${encodeURIComponent(serialNumber)}/traceurls`
      );
      return unwrapList<string>(payload);
    } catch (error) {
      if (error instanceof ConfigureApiError && error.status === 404) return [];
      throw error;
    }
  },

  /**
   * Download the trace archive as a tar blob. The gateway UI comma-joins the
   * full traceurls list into a single downloadtrace request; the comma stays
   * unencoded (it is the wire's list separator, not part of a file name).
   */
  async downloadTraceFiles(fileNames: string[]): Promise<Blob> {
    const path = `/v1/aps/downloadtrace/${fileNames.map(encodeURIComponent).join(',')}`;
    const response = await apiService.makeAuthenticatedRequest(
      path,
      { headers: { accept: 'application/tar' } },
      60000
    );
    if (!response.ok) {
      throw new Error(`Trace download failed: ${response.status}`);
    }
    return response.blob();
  },
};

/**
 * The gateway stamps the download with today's date: the first file's
 * "ApRpt...-" prefix becomes "ApRpt<yyyymmdd>-" (ap-controller showTraces).
 */
export function traceDownloadName(wireName: string, now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return wireName.replace(/ApRpt.+?-/, `ApRpt${now.getFullYear()}${month}${day}-`);
}

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
