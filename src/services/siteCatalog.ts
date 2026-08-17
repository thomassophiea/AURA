/**
 * Site Catalog — the one place that knows how AURA's site hierarchy is shaped.
 *
 * Everything here is a pure function over data the callers already have, so the
 * rules can be unit-tested without a controller, an XIQ session, or a rendered
 * component. The three rules worth naming:
 *
 *  1. **Gateway "Unassigned" is OS1 "Staging".** `isGatewayUnassigned` is the
 *     single translation point. Nothing else in the app should compare a site
 *     name against the string 'Unassigned'.
 *
 *  2. **System sites sort last, in both directions.** `pinSystemSitesLast`
 *     wraps a comparator so `sortPriority` is compared first. A component that
 *     sorts sites uses that wrapper instead of growing its own
 *     `if (name === 'Staging')` special case.
 *
 *  3. **The source value is never lost.** A site translated for display keeps
 *     the raw value the source system used in `sourceValue`, so a filter or a
 *     write can still speak the API's vocabulary.
 */

import { buildXiqSiteValue, parseXiqSiteValue } from './siteContextService';
import type { SiteGroup } from '../types/domain';
import type { Site } from './api';
import type { XiqSite } from './sle/xiqSites';
import {
  GATEWAY_UNASSIGNED_VALUE,
  NORMAL_SITE_SORT_PRIORITY,
  OS1_STAGING_KEY,
  OS1_STAGING_LABEL,
  SYSTEM_SITE_SORT_PRIORITY,
  XIQ_DEFAULT_LOCATION_ID,
  XIQ_DEFAULT_SITE_LABEL,
  type CatalogSite,
  type CatalogSiteGroup,
  type GatewayMode,
  type Os1Catalog,
  type XiqCatalog,
} from '../types/siteCatalog';

export * from '../types/siteCatalog';

// ── Gateway "Unassigned" → OS1 "Staging" ───────────────────────────────────

/**
 * Does this raw site value mean "no Site assignment" on the Gateway?
 *
 * The Gateway expresses the state two ways depending on the endpoint: the
 * literal string `Unassigned`, or simply an absent/blank site field. Both mean
 * the device is adopted but not yet placed, which is what OS1 calls Staging.
 */
export function isGatewayUnassigned(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  return trimmed.toLowerCase() === GATEWAY_UNASSIGNED_VALUE.toLowerCase();
}

/**
 * Site fields a Gateway device may carry, most specific first. Moved here from
 * AccessPoints so the picker and every device list resolve a device's site the
 * same way — if they disagreed, a device could be filtered into a site the
 * picker never offers.
 */
const DEVICE_SITE_FIELDS = [
  'hostSite',
  'location',
  'locationName',
  'apLocation',
  'ap_location',
  'site',
  'siteName',
  'site_name',
  'campus',
  'building',
  'siteId',
  'site_id',
  'place',
  'area',
  'zone',
] as const;

/**
 * The raw site value a device reports, or '' when it reports none. This is the
 * Gateway's vocabulary, not OS1's — see `resolveOs1SiteLabel` for display and
 * `resolveOs1DeviceSiteKey` for filtering.
 */
export function getDeviceSiteValue(device: unknown): string {
  if (!device || typeof device !== 'object') return '';
  const record = device as Record<string, unknown>;
  for (const field of DEVICE_SITE_FIELDS) {
    const value = record[field];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return '';
}

/**
 * The catalog key a device belongs under: its site name, or the Staging
 * sentinel when the Gateway reports it unassigned. Site filters compare against
 * this so selecting Staging in a picker selects the unassigned devices.
 */
export function resolveOs1DeviceSiteKey(device: unknown): string {
  const raw = getDeviceSiteValue(device);
  return isGatewayUnassigned(raw) ? OS1_STAGING_KEY : raw;
}

/**
 * What a device's site should read as in the UI. An unassigned device shows
 * `Staging`, never blank and never the Gateway's internal 'Unassigned'.
 */
export function resolveOs1SiteLabel(device: unknown): string {
  const raw = getDeviceSiteValue(device);
  return isGatewayUnassigned(raw) ? OS1_STAGING_LABEL : raw;
}

/** Is this catalog key one of the reserved system-site keys? */
export function isSystemSiteKey(key: string | null | undefined): boolean {
  if (!key) return false;
  return key === OS1_STAGING_KEY || key.endsWith(`:${XIQ_DEFAULT_LOCATION_ID}`);
}

/**
 * Display label for a system-site selector value, or null when the value refers
 * to a normal site. Pages resolve a selected site's name by looking it up in
 * their loaded list and falling back to the raw value — which would print a
 * sentinel for a system site. Consult this first.
 */
export function systemSiteLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key === OS1_STAGING_KEY) return OS1_STAGING_LABEL;
  if (key.endsWith(`:${XIQ_DEFAULT_LOCATION_ID}`)) return XIQ_DEFAULT_SITE_LABEL;
  return null;
}

// ── Ordering ───────────────────────────────────────────────────────────────

/**
 * Wrap a comparator so system sites always sink to the bottom.
 *
 * Apply this to the comparator the list *actually* sorts with — including any
 * direction flip. Wrapping the un-flipped comparator and negating afterwards
 * would negate the priority too, floating Staging to the top on a descending
 * sort, which is precisely the behavior this exists to prevent.
 */
export function pinSystemSitesLast<T extends { sortPriority?: number }>(
  compare: (a: T, b: T) => number
): (a: T, b: T) => number {
  return (a, b) => {
    const pa = a.sortPriority ?? NORMAL_SITE_SORT_PRIORITY;
    const pb = b.sortPriority ?? NORMAL_SITE_SORT_PRIORITY;
    if (pa !== pb) return pa - pb;
    return compare(a, b);
  };
}

/** Natural-language name comparison, matching how the existing lists read. */
function compareNames(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
}

/** Default site ordering: system sites last, everything else by name. */
export const compareCatalogSites = pinSystemSitesLast<CatalogSite>(compareNames);

/** Sort a site list without mutating the input. */
export function sortCatalogSites(sites: CatalogSite[]): CatalogSite[] {
  return [...sites].sort(compareCatalogSites);
}

// ── OS1 catalog ────────────────────────────────────────────────────────────

/**
 * A Site Group is the Gateway boundary. `paired` when a second Gateway backs
 * it — an HA pair — otherwise a single Gateway. Kept as a derivation rather
 * than a stored flag so it stays correct when a pair is added later.
 */
export function deriveGatewayMode(siteGroup: Pick<SiteGroup, 'secondary_controller'>): GatewayMode {
  const secondary = siteGroup.secondary_controller?.trim();
  return secondary ? 'paired' : 'standalone';
}

/** Human label for a Gateway boundary. Gateway vocabulary, not "controller". */
export function gatewayModeLabel(mode: GatewayMode): string {
  return mode === 'paired' ? 'Gateway Pair' : 'Standalone';
}

/**
 * How the Gateway behind a Site Group is identified next to its name.
 *
 * The Locking ID is the stable license identity and the design's first choice,
 * but it is only cached onto a Site Group after that group has been entered —
 * so in org scope it is usually absent. Falling back to the host name, then to
 * the host in the Gateway URL, means the boundary always names a real Gateway
 * rather than showing the Site Group name alone, which would leave the user
 * unable to tell which Gateway owns those Sites.
 */
export function gatewayIdentity(
  siteGroup: Partial<Pick<SiteGroup, 'locking_id' | 'hostname' | 'controller_url'>>
): string | null {
  const lockingId = siteGroup.locking_id?.trim();
  if (lockingId) return lockingId;
  const hostname = siteGroup.hostname?.trim();
  if (hostname) return hostname;
  const url = siteGroup.controller_url?.trim();
  if (!url) return null;
  try {
    return new URL(url).hostname || null;
  } catch {
    // Not a parseable URL — strip any scheme/port rather than showing nothing.
    return url.replace(/^\w+:\/\//, '').split('/')[0].split(':')[0] || null;
  }
}

function siteDisplayName(site: Site): string {
  return site.name || site.siteName || site.displayName || site.id;
}

/** Device count a Gateway site reports, or null when it reports none. */
function siteDeviceCount(site: Site): number | null {
  const candidates = [site.aps, site.ap_count, site.activeAPs];
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

export interface BuildOs1CatalogInput {
  /** Site Groups from AppContext — the Gateway boundaries. */
  siteGroups: SiteGroup[];
  /** OS1 sites, tagged with `site_group_id` where the loader knew it. */
  sites: Site[];
  /**
   * Devices the Gateway reports as unassigned. Pass null while unknown; the
   * Staging site is shown either way, because its existence does not depend on
   * anything being in it.
   */
  unassignedDeviceCount?: number | null;
  /**
   * What a normal OS1 site's `key` should be. Pages that filter rows by site
   * name use 'name'; pages that fetch per-site by id use 'id'. Mirrors the
   * existing `osSiteValue` prop on SourceSiteSelector.
   */
  osSiteValue?: 'name' | 'id';
}

/** The org-wide OS1 Staging site. Always exists; may be empty. */
export function buildStagingSite(deviceCount: number | null = null): CatalogSite {
  return {
    key: OS1_STAGING_KEY,
    id: OS1_STAGING_KEY,
    name: OS1_STAGING_LABEL,
    source: 'os1',
    systemKind: 'staging',
    sortPriority: SYSTEM_SITE_SORT_PRIORITY,
    // Org-wide: Staging aggregates across every Gateway boundary. The owning
    // Gateway is still known per-device, so splitting Staging per Site Group
    // later is a presentation change rather than a model change.
    siteGroupId: null,
    siteGroupName: null,
    deviceCount,
    sourceValue: GATEWAY_UNASSIGNED_VALUE,
  };
}

/**
 * Assemble the OS1 view: every Gateway boundary with the Sites it owns, plus
 * the org-wide Staging site.
 *
 * Sites whose owning Site Group is unknown are attributed to the default Site
 * Group (or the only one, when there is only one) rather than being dropped —
 * losing a site from the picker is far worse than attributing it optimistically.
 */
export function buildOs1Catalog(input: BuildOs1CatalogInput): Os1Catalog {
  const { siteGroups, sites, unassignedDeviceCount = null, osSiteValue = 'name' } = input;

  const fallbackGroup =
    siteGroups.find((sg) => sg.is_default) ?? (siteGroups.length === 1 ? siteGroups[0] : undefined);

  const byGroupId = new Map<string, CatalogSite[]>();
  for (const sg of siteGroups) byGroupId.set(sg.id, []);

  const orphans: CatalogSite[] = [];

  for (const site of sites) {
    const name = siteDisplayName(site);
    const groupId =
      (typeof site.site_group_id === 'string' && site.site_group_id) ||
      (typeof site.siteGroupId === 'string' && site.siteGroupId) ||
      fallbackGroup?.id ||
      null;
    const group = groupId ? siteGroups.find((sg) => sg.id === groupId) : undefined;

    const entry: CatalogSite = {
      key: osSiteValue === 'id' ? site.id : name,
      id: site.id,
      name,
      source: 'os1',
      sortPriority: NORMAL_SITE_SORT_PRIORITY,
      siteGroupId: group?.id ?? null,
      siteGroupName: group?.name ?? null,
      deviceCount: siteDeviceCount(site),
      sourceValue: name,
    };

    const bucket = group ? byGroupId.get(group.id) : undefined;
    if (bucket) bucket.push(entry);
    else orphans.push(entry);
  }

  const groups: CatalogSiteGroup[] = siteGroups.map((sg) => ({
    id: sg.id,
    name: sg.name,
    gatewayMode: deriveGatewayMode(sg),
    hostname: sg.hostname ?? null,
    lockingId: sg.locking_id ?? null,
    gatewayIdentity: gatewayIdentity(sg),
    sites: sortCatalogSites(byGroupId.get(sg.id) ?? []),
  }));

  // Sites we could not attribute to any Gateway still have to be reachable.
  if (orphans.length > 0) {
    groups.push({
      id: '__unattributed__',
      name: 'Other Sites',
      gatewayMode: 'standalone',
      hostname: null,
      lockingId: null,
      gatewayIdentity: null,
      sites: sortCatalogSites(orphans),
    });
  }

  return { groups, staging: buildStagingSite(unassignedDeviceCount) };
}

/** Every OS1 site in presentation order: grouped sites first, Staging last. */
export function flattenOs1Catalog(catalog: Os1Catalog): CatalogSite[] {
  return [...catalog.groups.flatMap((g) => g.sites), catalog.staging];
}

// ── XIQ catalog ────────────────────────────────────────────────────────────

/** Selector value for the XIQ Default Site under a given Site Group. */
export function buildXiqDefaultSiteValue(siteGroupId: string): string {
  return buildXiqSiteValue(siteGroupId, XIQ_DEFAULT_LOCATION_ID);
}

/**
 * Is this selector value the XIQ Default Site?
 *
 * `__default__` is a sentinel, not a real XIQ location id, so a caller must not
 * hand it to the XIQ API as a location filter — an unrecognised filter would
 * quietly return everything instead of the Default Site's own (currently empty)
 * contents.
 */
export function isXiqDefaultSiteValue(value: string | null | undefined): boolean {
  if (!value) return false;
  const parsed = parseXiqSiteValue(value);
  return parsed?.locationId === XIQ_DEFAULT_LOCATION_ID;
}

/** The XIQ Default Site. Present whenever an XIQ session exists; may be empty. */
export function buildXiqDefaultSite(siteGroupId: string, siteGroupName?: string | null): CatalogSite {
  return {
    key: buildXiqDefaultSiteValue(siteGroupId),
    id: XIQ_DEFAULT_LOCATION_ID,
    name: XIQ_DEFAULT_SITE_LABEL,
    source: 'xiq',
    systemKind: 'xiq-default',
    sortPriority: SYSTEM_SITE_SORT_PRIORITY,
    siteGroupId,
    siteGroupName: siteGroupName ?? null,
    // Zero rather than null: an empty Default Site is the expected state today,
    // not an unknown one.
    deviceCount: 0,
    sourceValue: XIQ_DEFAULT_SITE_LABEL,
  };
}

export interface BuildXiqCatalogInput {
  xiqSites: XiqSite[];
  /**
   * Site Group the Default Site hangs off. Defaults to the first XIQ site's
   * owning group, matching how "All XIQ Sites" is already keyed.
   */
  siteGroupId?: string | null;
  siteGroupName?: string | null;
}

/** Assemble the XIQ view: real sites in name order, then the Default Site. */
export function buildXiqCatalog(input: BuildXiqCatalogInput): XiqCatalog {
  const { xiqSites, siteGroupId, siteGroupName } = input;

  const sites: CatalogSite[] = xiqSites.map((site) => ({
    key: buildXiqSiteValue(site.siteGroupId, site.id),
    id: site.id,
    name: site.name,
    source: 'xiq',
    sortPriority: NORMAL_SITE_SORT_PRIORITY,
    siteGroupId: site.siteGroupId,
    siteGroupName: null,
    deviceCount: null,
    sourceValue: site.name,
  }));

  const owner = siteGroupId ?? xiqSites[0]?.siteGroupId ?? null;
  const defaultSite = owner ? buildXiqDefaultSite(owner, siteGroupName) : null;

  return {
    sites: sortCatalogSites(sites),
    defaultSite,
  };
}

/** Every XIQ site in presentation order: real sites first, Default Site last. */
export function flattenXiqCatalog(catalog: XiqCatalog): CatalogSite[] {
  return catalog.defaultSite ? [...catalog.sites, catalog.defaultSite] : [...catalog.sites];
}

// ── Assembled catalog ──────────────────────────────────────────────────────

export interface BuildSiteCatalogInput extends BuildOs1CatalogInput {
  xiqSites: XiqSite[];
  /**
   * Site Group that owns the XIQ session, when one is known independently of
   * the XIQ site list — so Default Site survives an empty location list.
   */
  xiqSiteGroupId?: string | null;
}

export interface SiteCatalogResult {
  os1: Os1Catalog;
  xiq: XiqCatalog;
  /**
   * Whether the XIQ section should render. True once a Site Group owns an XIQ
   * session, so Default Site appears even with no real XIQ sites, while an org
   * that has never connected XIQ keeps the pre-existing UI.
   */
  hasXiq: boolean;
}

/**
 * Assemble both domains in one call. Pure, so a component that already loaded
 * sites can build the catalog from what it holds instead of triggering a second
 * fetch.
 */
export function buildSiteCatalog(input: BuildSiteCatalogInput): SiteCatalogResult {
  const { xiqSites, xiqSiteGroupId, siteGroups, ...os1Input } = input;

  const os1 = buildOs1Catalog({ siteGroups, ...os1Input });
  const owner = xiqSites[0]?.siteGroupId ?? xiqSiteGroupId ?? null;
  const xiq = buildXiqCatalog({
    xiqSites,
    siteGroupId: owner,
    siteGroupName: siteGroups.find((sg) => sg.id === owner)?.name ?? null,
  });

  return { os1, xiq, hasXiq: owner !== null };
}
