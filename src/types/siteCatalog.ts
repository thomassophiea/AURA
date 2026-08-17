/**
 * Site Catalog types — the normalized site hierarchy AURA presents.
 *
 * Two management domains coexist in AURA and always will: OS1 (the Campus
 * Gateway) and IQ Engine / XIQ. This module is the vocabulary both are
 * expressed in, so no component has to know how either source spells things.
 *
 * The OS1 hierarchy is:
 *
 *   Site Group  →  Site  →  Device
 *
 * A Site Group *is* the Gateway boundary — one Gateway, or a Gateway/HA pair.
 * It is not a display folder: it determines which Gateway owns a Site, and
 * therefore where that Site's configuration is delivered.
 *
 * Alongside the real Sites, each domain has one **system site** — a location
 * the system itself owns rather than the operator:
 *
 *   OS1  →  Staging       (what the Gateway API calls "Unassigned")
 *   XIQ  →  Default Site
 *
 * Both are expected, normal places for a device to be. Neither is an error, and
 * neither may be styled as one. Both are always ordered last in their own list;
 * see `sortPriority` and `pinSystemSitesLast` in `services/siteCatalog.ts`.
 */

/** Which management domain a site belongs to. */
export type ManagementSource = 'os1' | 'xiq';

/**
 * A site the system owns rather than the operator. Absent on operator-created
 * sites, so `systemKind !== undefined` is the test for "is this special".
 */
export type SystemSiteKind = 'staging' | 'xiq-default';

/** A Gateway boundary: a single Gateway, or a Gateway/HA pair. */
export type GatewayMode = 'standalone' | 'paired';

/**
 * Sort priority. Ordering compares this before anything else, so a system site
 * cannot be dragged into the middle of a list by an alphabetical sort — in
 * either direction. Normal sites all share priority 0 and are then ordered by
 * whatever the surrounding list already ordered by.
 */
export const NORMAL_SITE_SORT_PRIORITY = 0;
export const SYSTEM_SITE_SORT_PRIORITY = 100;

/** Selector value for the org-wide OS1 Staging site. */
export const OS1_STAGING_KEY = '__os1_staging__';

/** OS1-facing label for the Gateway's "Unassigned" state. */
export const OS1_STAGING_LABEL = 'Staging';

/**
 * Location id used to encode the XIQ Default Site inside the existing
 * `xiq:<siteGroupId>:<locationId>` selector-value scheme.
 */
export const XIQ_DEFAULT_LOCATION_ID = '__default__';

/** IQ Engine / XIQ label for its system site. */
export const XIQ_DEFAULT_SITE_LABEL = 'Default Site';

/**
 * The value the Gateway API uses for a device with no Site assignment. Kept as
 * the canonical spelling for `CatalogSite.sourceValue` so the raw Gateway term
 * survives the translation to "Staging" and can be sent back unchanged.
 */
export const GATEWAY_UNASSIGNED_VALUE = 'Unassigned';

/** Explanatory copy for the two system sites. Neutral by design. */
export const OS1_STAGING_DESCRIPTION =
  'Devices adopted by a Gateway that are not yet assigned to a Site. Shown as Unassigned on the Gateway.';
export const XIQ_DEFAULT_SITE_DESCRIPTION =
  'The IQ Engine default location. Devices with no explicit site assignment appear here.';

/** A site in either management domain, normal or system. */
export interface CatalogSite {
  /**
   * The value a picker uses to represent this site. Deliberately distinct from
   * `id`, because the two domains key differently: OS1 pages filter by site
   * name or id depending on the page, XIQ sites are encoded as
   * `xiq:<siteGroupId>:<locationId>`, and system sites use a reserved sentinel.
   */
  key: string;
  /** Real identifier where one exists; the sentinel key for system sites. */
  id: string;
  /** Display name. `Staging` / `Default Site` for system sites. */
  name: string;
  source: ManagementSource;
  /** Present only on system sites. */
  systemKind?: SystemSiteKind;
  sortPriority: number;
  /** Owning Site Group, or null for the org-wide Staging entry. */
  siteGroupId: string | null;
  siteGroupName: string | null;
  /** Devices in this site; null when not yet known (still loading). */
  deviceCount: number | null;
  /**
   * The untranslated value the source system uses for this site — e.g.
   * `Unassigned` for Staging. Never send `name` back to an API; send this.
   */
  sourceValue?: string;
}

/** An OS1 Site Group: the Gateway boundary, plus the Sites it owns. */
export interface CatalogSiteGroup {
  id: string;
  name: string;
  gatewayMode: GatewayMode;
  /** Gateway host name, when known. */
  hostname: string | null;
  /** Gateway Locking ID — the stable license identity shown next to the name. */
  lockingId: string | null;
  /** Sites owned by this Gateway boundary, already ordered. */
  sites: CatalogSite[];
}

/** The assembled OS1 view: Gateway boundaries, plus the org-wide Staging site. */
export interface Os1Catalog {
  groups: CatalogSiteGroup[];
  /**
   * Org-wide Staging. Always present so the concept is visible even at zero
   * devices — a Gateway with nothing unassigned still has a Staging area.
   */
  staging: CatalogSite;
}

/** The assembled XIQ view: real sites, then the Default Site. */
export interface XiqCatalog {
  sites: CatalogSite[];
  defaultSite: CatalogSite | null;
}
