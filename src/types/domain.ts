/**
 * Canonical domain types for the AURA organizational hierarchy.
 *
 * Hierarchy:
 *   Organization
 *   └─ SiteGroup  (maps 1:1 to a controller pair or single controller domain)
 *      └─ Site
 *         └─ Device  (AccessPoint)
 *            └─ Client  (Station / connected endpoint)
 *
 * SiteGroup is the bridge between org-level configuration authoring and
 * controller-level delivery. All API calls that target a controller are
 * routed through the SiteGroup's controller_url.
 */

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logo_url?: string;
  settings?: Record<string, unknown>;
  created_at?: string;
}

/**
 * SiteGroup represents one controller pair or single campus controller domain.
 * At this stage each SiteGroup maps 1:1 to a Controller record.
 * The model is designed to scale to multiple controller pairs without
 * re-architecting — future pairs simply add more SiteGroup entries.
 */
export interface SiteGroup {
  id: string;
  org_id: string;
  name: string;
  description?: string;
  /** Resolved base URL for the backing controller — ready for API calls. */
  controller_url: string;
  controller_port?: number;
  primary_controller?: string;
  secondary_controller?: string;
  connection_status: 'connected' | 'disconnected' | 'error' | 'unknown';
  last_connected_at?: string;
  is_default: boolean;
  region?: string;
  tags?: string[];
  site_count?: number;
  created_at?: string;
  updated_at?: string;
  /** XIQ cloud connection — present when the site group has an active XIQ token. */
  xiq_authenticated?: boolean;
  /** XIQ region key (global | eu | apac | ca) for this site group's XIQ account. */
  xiq_region?: string;
}

export interface Site {
  id: string;
  name: string;
  site_group_id: string;
  site_group_name?: string;
  org_id?: string;
  location?: string;
  country?: string;
  timezone?: string;
  description?: string;
  status?: 'active' | 'inactive' | 'provisioning' | 'error';
  ap_count?: number;
  client_count?: number;
  network_count?: number;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
  /** @deprecated Use name instead */
  siteName?: string;
  /** @deprecated Use name instead */
  displayName?: string;
}

export interface Device {
  serial_number: string;
  site_id?: string;
  site_group_id?: string;
  org_id?: string;
  name?: string;
  model?: string;
  hardware_type?: string;
  status?: 'connected' | 'disconnected' | 'error';
  client_count?: number;
}

export interface Client {
  mac_address: string;
  ap_serial_number?: string;
  site_id?: string;
  site_group_id?: string;
  org_id?: string;
  hostname?: string;
  ip_address?: string;
  username?: string;
  ssid?: string;
  rssi?: number;
}

/**
 * The current navigation scope. null at any level means "all" for that level.
 * Components read this to scope data fetches and display context breadcrumbs.
 */
export interface NavigationContext {
  organization: Organization | null;
  siteGroup: SiteGroup | null;
  site: Site | null;
  device: Device | null;
}
