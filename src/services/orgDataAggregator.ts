/**
 * Org-Level Data Aggregator
 *
 * Fetches the same endpoint from all site-group controllers in parallel,
 * tags each record with its source site group, and returns a merged array.
 *
 * Usage:
 *   const aggregator = new OrgDataAggregator(siteGroups);
 *   const { data, errors } = await aggregator.fetchAll<AP>('/v1/aps');
 *   // data = AP[] with _siteGroupId / _siteGroupName injected
 */

import type { SiteGroup } from '../types/domain';
import { apiService } from './api';

/** Every aggregated record gets these fields injected. */
export interface AggregatedMeta {
  _siteGroupId: string;
  _siteGroupName: string;
}

export interface AggregatedResult<T> {
  /** All records merged across controllers, tagged with source site group. */
  data: Array<T & AggregatedMeta>;
  /** Per-controller errors (controller that failed won't contribute data). */
  errors: Array<{ siteGroupId: string; siteGroupName: string; error: string }>;
  /** Map from siteGroupId → count of records from that controller. */
  countBySiteGroup: Map<string, number>;
}

export class OrgDataAggregator {
  constructor(private siteGroups: SiteGroup[]) {}

  /**
   * Fetch `endpoint` from every controller in parallel, merge results.
   *
   * @param endpoint  API path, e.g. '/v1/aps' or '/v1/stations'
   * @param options   Optional: extract array from response JSON (default: response is the array)
   */
  async fetchAll<T = any>(
    endpoint: string,
    options?: {
      /** If the response is `{ data: [...] }`, pass `json => json.data` */
      extractArray?: (json: any) => T[];
      /** Timeout per controller (ms). Default 10 000. */
      timeoutMs?: number;
    },
  ): Promise<AggregatedResult<T>> {
    const extract = options?.extractArray ?? ((json: any) => {
      if (Array.isArray(json)) return json as T[];
      if (json?.data && Array.isArray(json.data)) return json.data as T[];
      return [] as T[];
    });
    const timeoutMs = options?.timeoutMs ?? 10_000;

    const data: Array<T & AggregatedMeta> = [];
    const errors: AggregatedResult<T>['errors'] = [];
    const countBySiteGroup = new Map<string, number>();

    // Save and restore the global base URL so we don't corrupt other in-flight work.
    const originalBaseUrl = apiService.getBaseUrl();

    // For a single controller (common case today), skip the URL juggling.
    if (this.siteGroups.length <= 1 && this.siteGroups.length > 0) {
      const sg = this.siteGroups[0];
      try {
        const response = await apiService.makeAuthenticatedRequest(endpoint, {}, timeoutMs);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json();
        const records = extract(json);
        const tagged = records.map(r => ({
          ...r,
          _siteGroupId: sg.id,
          _siteGroupName: sg.name,
        }));
        data.push(...tagged);
        countBySiteGroup.set(sg.id, records.length);
      } catch (err) {
        errors.push({
          siteGroupId: sg.id,
          siteGroupName: sg.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return { data, errors, countBySiteGroup };
    }

    // Multiple controllers: fetch sequentially to avoid global-state races.
    // Each controller gets its own base-URL context.
    // TODO: When apiService supports per-request URL overrides, switch to Promise.all.
    for (const sg of this.siteGroups) {
      try {
        apiService.setBaseUrl(`${sg.controller_url}/management`);
        const response = await apiService.makeAuthenticatedRequest(endpoint, {}, timeoutMs);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json();
        const records = extract(json);
        const tagged = records.map(r => ({
          ...r,
          _siteGroupId: sg.id,
          _siteGroupName: sg.name,
        }));
        data.push(...tagged);
        countBySiteGroup.set(sg.id, records.length);
      } catch (err) {
        errors.push({
          siteGroupId: sg.id,
          siteGroupName: sg.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Restore original base URL
    apiService.setBaseUrl(originalBaseUrl === '/api/management' ? null : originalBaseUrl);

    return { data, errors, countBySiteGroup };
  }

  /**
   * Convenience: fetch and return a simple merged array (ignoring errors).
   */
  async fetchMerged<T = any>(
    endpoint: string,
    extractArray?: (json: any) => T[],
  ): Promise<Array<T & AggregatedMeta>> {
    const { data } = await this.fetchAll<T>(endpoint, { extractArray });
    return data;
  }
}
