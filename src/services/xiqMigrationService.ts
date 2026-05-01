/**
 * XIQ Migration Service
 *
 * Full migration pipeline: XIQ → on-prem controller.
 * Ported from XIQ-Transformation (Python) to TypeScript.
 *
 * Flow:
 *   fetchAllXIQData()              → SSIDs, VLANs, RADIUS, Devices from XIQ
 *   fetchControllerProfiles()      → AP profiles from controller
 *   fetchExistingTopologies()      → existing VLANs on controller (conflict check)
 *   convertToControllerFormat()    → XIQ objects → controller schema
 *   executeMigration()             → POST in order, assign profiles, optionally enable
 *   downloadMigrationReport()      → PDF report download
 *
 * XIQ API Notes (as of v25.9.0-36):
 *   - PSK/PPSK passwords are WRITE-ONLY — no endpoint returns key_value.
 *     Use POST /ssids/{id}/psk/password to set; imported services will need
 *     passwords configured manually on the controller.
 *   - SSID list: GET /policy/ssids (paginated, limit/page params)
 *   - Devices:   GET /devices (serial_number, hostname, product_type, location)
 *   - Profiles:  GET /user-profiles (vlan_profile.default_vlan_id for VLAN mapping)
 *   - RADIUS:    GET /radius-servers or /radius-servers/external
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { type XIQStoredToken } from './xiqService';
import { apiService } from './api';

const DEFAULT_ROLE_ID = '4459ee6c-2f76-11e7-93ae-92361f002671';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface XIQSSIDSecurity {
  type: 'open' | 'psk' | 'ppsk' | 'dot1x' | 'owe';
  psk?: string;
  wpa_version: string;
  pmf: 'disabled' | 'optional' | 'required';
  encryption: string;
  key_management: string;
}

export interface XIQNormalizedSSID {
  id: string;
  name: string;
  enabled: boolean;
  broadcast_ssid: boolean;
  vlan_id?: number;
  default_user_profile?: string;
  security: XIQSSIDSecurity;
  fast_roaming: boolean;
  captive_portal?: string;
}

export interface XIQNormalizedVLAN {
  id: string;
  vlan_id: number;
  name: string;
  user_profile_name: string;
  user_profile_id: string;
}

export interface XIQNormalizedRADIUS {
  id: string;
  name: string;
  ip: string;
  auth_port: number;
  acct_port: number;
  secret: string;
  timeout: number;
  retries: number;
}

export interface XIQNormalizedDevice {
  serial_number: string;
  name: string;
  location: string;
  model: string;
}

export interface XIQMigrationData {
  ssids: XIQNormalizedSSID[];
  vlans: XIQNormalizedVLAN[];
  radius: XIQNormalizedRADIUS[];
  devices: XIQNormalizedDevice[];
}

export interface ControllerProfile {
  id: string;
  name: string;
  apPlatform?: string;
  radioIfList: { serviceId: string; index: number }[];
  isCustom: boolean;
}

export interface MigrationSelections {
  ssidIds: Set<string>;
  vlanIds: Set<string>;
  radiusIds: Set<string>;
}

export type ProfileAssignmentMode = 'all' | 'custom' | 'none';

export interface MigrationOptions {
  dryRun: boolean;
  enableAfterMigration: boolean;
  profileAssignmentMode: ProfileAssignmentMode;
  /** Skip SSIDs whose name already exists on the controller. Default true. */
  skipExisting?: boolean;
  /** Retry attempts per object on transient failures. Default 2. */
  retryAttempts?: number;
  /** Abort signal for cancelling an in-flight migration between operations. */
  signal?: AbortSignal;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface MigrationResult {
  topologies: { succeeded: number; skipped: number; failed: number };
  aaaPolicies: { succeeded: number; failed: number };
  services: {
    succeeded: string[];
    failed: { name: string; error: string }[];
    skipped: string[]; // already existed on controller
  };
  profileAssignments: { updated: number; failed: number };
  aborted?: boolean;
}

export interface ConvertedConfig {
  topologies: Record<string, unknown>[];
  aaaPolicies: Record<string, unknown>[];
  services: Record<string, unknown>[];
  /**
   * Regular PSK SSIDs where the key was unavailable — imported with placeholder '12345678'.
   * Must be updated on the controller before enabling.
   */
  pskPlaceholders: string[];
  /**
   * PPSK SSIDs where no key was available — PPSK uses per-user keys managed by XIQ,
   * so a placeholder is not applicable. These are imported as open; configure via XIQ PPSK portal.
   */
  ppskWarnings: string[];
  /**
   * RADIUS servers where shared_secret was empty — XIQ may mask secrets in GET responses.
   * The AAA policy was created but authentication will fail until the secret is set on the controller.
   */
  radiusSecretWarnings: string[];
  /** SSIDs filtered out because a service with the same name already exists on the controller. */
  skippedExistingServices: string[];
}

// ─── XIQ Proxy Helpers ────────────────────────────────────────────────────────

async function xiqGet(token: XIQStoredToken, path: string): Promise<unknown> {
  const res = await fetch(`/xiq/api${path}`, {
    method: 'GET',
    headers: {
      'X-XIQ-Token': token.access_token,
      'X-XIQ-Region': token.region,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    let msg = `XIQ ${path} failed (${res.status})`;
    try {
      const b = (await res.json()) as Record<string, string>;
      if (b.error || b.message) msg = b.error || b.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

async function xiqGetPaginated(
  token: XIQStoredToken,
  endpoint: string
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let page = 1;
  while (true) {
    const result = await xiqGet(token, `${endpoint}?page=${page}&limit=100`);
    let items: Record<string, unknown>[] = [];
    if (Array.isArray(result)) {
      items = result as Record<string, unknown>[];
    } else {
      const r = result as Record<string, unknown>;
      items = (r.data ?? r.items ?? r.results ?? []) as Record<string, unknown>[];
    }
    if (items.length === 0) break;
    all.push(...items);
    const totalPages =
      typeof result === 'object' && result !== null
        ? (((result as Record<string, unknown>).total_pages ??
            (result as Record<string, unknown>).totalPages ??
            1) as number)
        : 1;
    if (page >= totalPages || items.length < 100) break;
    page++;
  }
  return all;
}

// ─── Security Normalization ───────────────────────────────────────────────────

function normalizeSSIDSecurity(ssid: Record<string, unknown>): XIQSSIDSecurity {
  const accessSecurity = (ssid.access_security ?? {}) as Record<string, unknown>;
  const secType = ((accessSecurity.security_type ?? 'OPEN') as string).toUpperCase();
  const typeMap: Record<string, XIQSSIDSecurity['type']> = {
    OPEN: 'open',
    PSK: 'psk',
    PPSK: 'ppsk',
    '802DOT1X': 'dot1x',
    'ENHANCED-OPEN': 'owe',
  };
  const type = typeMap[secType] ?? 'open';
  const rawPsk = accessSecurity.key_value as string | undefined;
  const psk = rawPsk && rawPsk !== '' ? rawPsk : undefined;
  const keyManagement = (accessSecurity.key_management as string) ?? '';
  const wpa_version = keyManagement.includes('WPA3') ? 'WPA3' : 'WPA2';
  const pmf: XIQSSIDSecurity['pmf'] = keyManagement.includes('WPA3') ? 'required' : 'optional';
  const encMap: Record<string, string> = { CCMP: 'aes', AES: 'aes', TKIP: 'tkip', NONE: 'none' };
  const encryption = encMap[(accessSecurity.encryption_method as string) ?? ''] ?? 'aes';
  return { type, psk, wpa_version, pmf, encryption, key_management: keyManagement };
}

// ─── XIQ Data Fetching ────────────────────────────────────────────────────────

export async function fetchXIQSSIDs(token: XIQStoredToken): Promise<XIQNormalizedSSID[]> {
  const raw = await xiqGetPaginated(token, '/ssids');
  return raw
    .map((s) => ({
      id: String(s.id ?? ''),
      name: String(s.ssid_name ?? s.name ?? ''),
      enabled: (s.enabled_status as string) === 'ENABLE',
      broadcast_ssid: (s.broadcast_ssid as boolean) ?? true,
      vlan_id: (s.access_vlan ?? s.vlan_id) as number | undefined,
      default_user_profile: s.default_user_profile as string | undefined,
      security: normalizeSSIDSecurity(s),
      fast_roaming: (s.fast_roaming_802_11r as string) === 'ENABLED',
      captive_portal: s.captive_web_portal_id as string | undefined,
    }))
    .filter((s) => s.id && s.name);
}

export async function fetchXIQVLANs(token: XIQStoredToken): Promise<XIQNormalizedVLAN[]> {
  const profiles = await xiqGetPaginated(token, '/user-profiles');
  const seen = new Set<number>();
  const vlans: XIQNormalizedVLAN[] = [];
  for (const profile of profiles) {
    const vlanProfile = (profile.vlan_profile ?? {}) as Record<string, unknown>;
    const vlanId = vlanProfile.default_vlan_id as number | undefined;
    if (!vlanId || seen.has(vlanId)) continue;
    seen.add(vlanId);
    vlans.push({
      id: String(vlanProfile.id ?? `vlan_${vlanId}`),
      vlan_id: vlanId,
      name: String(vlanProfile.name ?? `VLAN_${vlanId}`),
      user_profile_name: String(profile.name ?? ''),
      user_profile_id: String(profile.id ?? ''),
    });
  }
  return vlans;
}

export async function fetchXIQRADIUS(token: XIQStoredToken): Promise<XIQNormalizedRADIUS[]> {
  let raw: Record<string, unknown>[] = [];
  for (const endpoint of ['/radius-servers/external', '/radius-servers', '/aaa-servers']) {
    try {
      raw = await xiqGetPaginated(token, endpoint);
      if (raw.length > 0) break;
    } catch {
      /* try next */
    }
  }
  return raw.map((s) => ({
    id: String(s.id ?? ''),
    name: String(s.name ?? s.server_name ?? ''),
    ip: String(s.ip_address ?? s.ip ?? ''),
    auth_port: Number(s.auth_port ?? s.authentication_port ?? 1812),
    acct_port: Number(s.acct_port ?? s.accounting_port ?? 1813),
    secret: String(s.shared_secret ?? s.secret ?? ''),
    timeout: Number(s.timeout ?? 5),
    retries: Number(s.retries ?? 3),
  }));
}

export async function fetchXIQDevices(token: XIQStoredToken): Promise<XIQNormalizedDevice[]> {
  const raw = await xiqGetPaginated(token, '/devices');
  return raw
    .filter(
      (d) => (d.device_function as string) === 'AP' || String(d.product_type ?? '').startsWith('AP')
    )
    .map((d) => ({
      serial_number: String(d.serial_number ?? ''),
      name: String(d.hostname ?? d.device_name ?? d.serial_number ?? ''),
      location: String(d.location ?? ''),
      model: String(d.product_type ?? d.model ?? ''),
    }));
}

export async function fetchAllXIQData(token: XIQStoredToken): Promise<XIQMigrationData> {
  const [ssids, vlans, radius, devices] = await Promise.all([
    fetchXIQSSIDs(token),
    fetchXIQVLANs(token),
    fetchXIQRADIUS(token),
    fetchXIQDevices(token),
  ]);
  return { ssids, vlans, radius, devices };
}

// ─── Controller Data Fetching ─────────────────────────────────────────────────

export async function fetchControllerProfiles(): Promise<ControllerProfile[]> {
  const res = await apiService.makeAuthenticatedRequest('/v3/profiles', {}, 15000);
  if (!res.ok) throw new Error(`Failed to fetch profiles (${res.status})`);
  const data = (await res.json()) as Record<string, unknown>[];
  const list = Array.isArray(data) ? data : [];
  const customs = list.filter(
    (p) =>
      !String(p.name ?? '')
        .toLowerCase()
        .includes('/default')
  );
  const defaults = list.filter((p) =>
    String(p.name ?? '')
      .toLowerCase()
      .includes('/default')
  );
  customs.sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')));
  defaults.sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')));
  return [...customs, ...defaults].map((p) => ({
    id: String(p.id ?? ''),
    name: String(p.name ?? ''),
    apPlatform: p.apPlatform as string | undefined,
    radioIfList: (p.radioIfList ?? []) as { serviceId: string; index: number }[],
    isCustom: !String(p.name ?? '')
      .toLowerCase()
      .includes('/default'),
  }));
}

export async function fetchExistingTopologies(): Promise<Record<string, unknown>[]> {
  try {
    const res = await apiService.makeAuthenticatedRequest('/v1/topologies', {}, 10000);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
}

/**
 * Fetch all existing controller services so the migration can skip duplicates.
 * Returns an empty list on failure rather than aborting the migration.
 */
export async function fetchExistingServices(): Promise<Record<string, unknown>[]> {
  try {
    const res = await apiService.makeAuthenticatedRequest('/v1/services', {}, 12000);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
}

// ─── Conversion ───────────────────────────────────────────────────────────────

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function convertPrivacy(security: XIQSSIDSecurity): Record<string, unknown> | null {
  const pmfMap: Record<string, string> = {
    disabled: 'disabled',
    optional: 'enabled',
    required: 'required',
  };
  const pmfMode = pmfMap[security.pmf] ?? 'enabled';
  if (security.type === 'open' || security.type === 'owe') return null;
  if (security.type === 'psk') {
    // XIQ never returns the PSK key — use placeholder so the controller entry is valid.
    // Operator must update this password before enabling the SSID.
    const presharedKey = security.psk ?? '12345678';
    return { WpaPskElement: { mode: 'auto', pmfMode, keyHexEncoded: false, presharedKey } };
  }
  if (security.type === 'ppsk') {
    const presharedKey = security.psk ?? '12345678';
    return { WpaPskElement: { mode: 'auto', pmfMode, keyHexEncoded: false, presharedKey } };
  }
  if (security.type === 'dot1x') {
    return { WpaEnterpriseElement: { mode: 'auto', pmfMode } };
  }
  return null;
}

export function convertToControllerFormat(
  data: XIQMigrationData,
  selections: MigrationSelections,
  existingTopologies: Record<string, unknown>[],
  existingServices: Record<string, unknown>[] = []
): ConvertedConfig {
  // Skip SSIDs whose name already exists as a service on the controller. The
  // controller match is case-insensitive and based on `serviceName` or `ssid`.
  const existingNames = new Set(
    existingServices.flatMap((s) => {
      const names: string[] = [];
      if (typeof s.serviceName === 'string') names.push(s.serviceName.toLowerCase());
      if (typeof s.ssid === 'string') names.push(s.ssid.toLowerCase());
      return names;
    })
  );
  const skippedExistingServices: string[] = [];
  const selectedSSIDs = data.ssids
    .filter((s) => selections.ssidIds.has(s.id))
    .filter((s) => {
      if (existingNames.has(s.name.toLowerCase())) {
        skippedExistingServices.push(s.name);
        return false;
      }
      return true;
    });
  const selectedVLANs = data.vlans.filter((v) => selections.vlanIds.has(v.id));
  const selectedRADIUS = data.radius.filter((r) => selections.radiusIds.has(r.id));

  const existingVlanIds = new Set(
    existingTopologies.map((t) => t.vlanid as number).filter(Boolean)
  );
  const vlanToTopologyId = new Map<number, string>();
  for (const t of existingTopologies) {
    if (t.vlanid && t.id) vlanToTopologyId.set(t.vlanid as number, t.id as string);
  }

  // Convert VLANs → Topologies
  const topologies: Record<string, unknown>[] = [];
  for (const vlan of selectedVLANs) {
    if (vlan.vlan_id < 1 || vlan.vlan_id > 4094) continue;
    if (existingVlanIds.has(vlan.vlan_id)) {
      // Already exists — don't re-create but track its ID
      continue;
    }
    const topologyId = uuid();
    vlanToTopologyId.set(vlan.vlan_id, topologyId);
    topologies.push({
      id: topologyId,
      name: vlan.name,
      vlanid: vlan.vlan_id,
      tagged: false,
      multicastFilters: [],
      multicastBridging: false,
      mode: 'BridgedAtAc',
      group: 0,
      members: [],
      mtu: 1500,
      enableMgmtTraffic: false,
      dhcpServers: '',
      l3Presence: false,
      ipAddress: '0.0.0.0',
      cidr: 0,
      gateway: '0.0.0.0',
      dhcpStartIpRange: '0.0.0.0',
      dhcpEndIpRange: '0.0.0.0',
      dhcpMode: 'DHCPNone',
      dhcpDomain: '',
      dhcpDefaultLease: 36000,
      dhcpMaxLease: 2592000,
      dhcpDnsServers: '',
      wins: '',
      portName: `vlan${vlan.vlan_id}`,
      vlanMapToEsa: -1,
      dhcpExclusions: [],
      foreignIpAddress: '0.0.0.0',
      apRegistration: false,
      fqdn: '',
      isid: 0,
      pool: [],
      proxied: 'Local',
      features: ['CENTRALIZED-SITE'],
    });
  }

  // Convert RADIUS → AAA Policies
  const radiusSecretWarnings = selectedRADIUS.filter((r) => !r.secret).map((r) => r.name);

  const aaaPolicies: Record<string, unknown>[] = [];
  if (selectedRADIUS.length > 0) {
    aaaPolicies.push({
      id: uuid(),
      name: 'XIQ_RADIUS_Policy',
      authenticationRadiusServers: selectedRADIUS.map((s) => ({
        id: uuid(),
        ipAddress: s.ip,
        sharedSecret: s.secret,
        port: s.acct_port,
        timeout: s.timeout,
        totalRetries: s.retries,
        pollInterval: 60,
      })),
      accountingRadiusServers: [],
      authenticationType: 'PAP',
      serverPoolingMode: 'failover',
      features: ['CENTRALIZED-SITE'],
    });
  }

  // Convert SSIDs → Services
  const services: Record<string, unknown>[] = [];
  const pskPlaceholders: string[] = []; // PSK SSIDs where '12345678' was used as placeholder
  const ppskWarnings: string[] = []; // PPSK SSIDs imported as open (no shared placeholder applicable)
  for (const ssid of selectedSSIDs) {
    const privacy = convertPrivacy(ssid.security);
    if (ssid.security.type === 'psk' && !ssid.security.psk) {
      pskPlaceholders.push(ssid.name);
    } else if (ssid.security.type === 'ppsk' && !ssid.security.psk) {
      ppskWarnings.push(ssid.name);
    }
    const topologyId = ssid.vlan_id ? (vlanToTopologyId.get(ssid.vlan_id) ?? null) : null;
    const serviceId = uuid();
    const service: Record<string, unknown> = {
      id: serviceId,
      serviceName: ssid.name.slice(0, 64),
      ssid: ssid.name.slice(0, 32),
      status: 'disabled',
      suppressSsid: !ssid.broadcast_ssid,
      proxied: 'Local',
      shutdownOnMeshpointLoss: false,
      dot1dPortNumber: 101,
      enabled11kSupport: ssid.fast_roaming,
      rm11kBeaconReport: false,
      rm11kQuietIe: false,
      uapsdEnabled: true,
      admissionControlVideo: false,
      admissionControlVoice: false,
      admissionControlBestEffort: false,
      admissionControlBackgroundTraffic: false,
      flexibleClientAccess: false,
      mbaAuthorization: false,
      accountingEnabled: false,
      clientToClientCommunication: true,
      includeHostname: false,
      mbo: false,
      oweAutogen: false,
      oweCompanion: null,
      purgeOnDisconnect: false,
      enable11mcSupport: true,
      beaconProtection: false,
      enableCaptivePortal: !!ssid.captive_portal,
      captivePortalType: null,
      eGuestPortalId: null,
      eGuestSettings: [],
      preAuthenticatedIdleTimeout: 300,
      postAuthenticatedIdleTimeout: 1800,
      sessionTimeout: 0,
      defaultTopology: topologyId,
      defaultCoS: null,
      unAuthenticatedUserDefaultRoleID: DEFAULT_ROLE_ID,
      authenticatedUserDefaultRoleID: DEFAULT_ROLE_ID,
      cpNonAuthenticatedPolicyName: null,
      aaaPolicyId: null,
      mbatimeoutRoleId: null,
      roamingAssistPolicy: null,
      features: ['CENTRALIZED-SITE'],
      vendorSpecificAttributes: ['apName', 'vnsName', 'ssid'],
      hotspotType: 'Disabled',
      hotspot: null,
      dscp: {
        codePoints: [
          2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 2, 0, 1, 0, 3, 0, 3, 0, 3, 0, 3, 0, 4, 0, 4, 0,
          4, 0, 4, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 6, 0, 6, 0, 0, 0, 0, 0, 0, 0, 7, 0, 0, 0,
          0, 0, 0, 0,
        ],
      },
    };
    if (privacy) service.privacy = privacy;
    services.push(service);
  }

  return {
    topologies,
    aaaPolicies,
    services,
    pskPlaceholders,
    ppskWarnings,
    radiusSecretWarnings,
    skippedExistingServices,
  };
}

// ─── Migration Execution ──────────────────────────────────────────────────────

class MigrationAbortedError extends Error {
  constructor() {
    super('Migration aborted');
    this.name = 'MigrationAbortedError';
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new MigrationAbortedError();
}

/**
 * Retry a controllerPost on transient failures with exponential backoff.
 * 4xx responses are not retried; 5xx and network errors are.
 */
async function controllerPostWithRetry(
  endpoint: string,
  payload: Record<string, unknown>,
  attempts: number,
  signal?: AbortSignal
): Promise<{ ok: boolean; id?: string; error?: string; attemptsUsed: number }> {
  const max = Math.max(1, attempts);
  let last: { ok: boolean; id?: string; error?: string; status?: number } = {
    ok: false,
    error: 'No attempts',
  };
  for (let i = 0; i < max; i++) {
    throwIfAborted(signal);
    last = await controllerPost(endpoint, payload);
    if (last.ok) return { ...last, attemptsUsed: i + 1 };
    // Don't retry 4xx — those are the caller's fault and won't change.
    const isClientError =
      typeof last.status === 'number' && last.status >= 400 && last.status < 500;
    if (isClientError || i === max - 1) break;
    const backoff = 250 * 2 ** i; // 250ms, 500ms, 1s, …
    await new Promise((r) => setTimeout(r, backoff));
  }
  return { ...last, attemptsUsed: max };
}

async function controllerPost(
  endpoint: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; id?: string; error?: string; status?: number }> {
  try {
    const res = await apiService.makeAuthenticatedRequest(
      endpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      20000
    );
    if (res.ok || res.status === 201) {
      let data: Record<string, unknown> = {};
      try {
        data = (await res.json()) as Record<string, unknown>;
      } catch {
        /* ignore */
      }
      return {
        ok: true,
        id: (data.id as string | undefined) ?? (payload.id as string | undefined),
      };
    }
    let errMsg = `HTTP ${res.status}`;
    try {
      const b = (await res.json()) as Record<string, string>;
      if (b.error || b.message) errMsg = b.error || b.message;
    } catch {
      /* ignore */
    }
    return { ok: false, error: errMsg, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function executeMigration(
  config: ConvertedConfig,
  existingTopologiesCount: number,
  profiles: ControllerProfile[],
  options: MigrationOptions,
  log: (msg: string, level?: LogEntry['level']) => void
): Promise<MigrationResult> {
  const result: MigrationResult = {
    topologies: { succeeded: 0, skipped: existingTopologiesCount, failed: 0 },
    aaaPolicies: { succeeded: 0, failed: 0 },
    services: { succeeded: [], failed: [], skipped: [...config.skippedExistingServices] },
    profileAssignments: { updated: 0, failed: 0 },
  };

  const retryAttempts = options.retryAttempts ?? 2;

  if (config.skippedExistingServices.length > 0) {
    log(
      `Skipping ${config.skippedExistingServices.length} SSID(s) already on controller: ${config.skippedExistingServices.join(', ')}`,
      'warn'
    );
  }

  if (config.pskPlaceholders.length > 0) {
    log(
      `Warning: PSK password unavailable for ${config.pskPlaceholders.length} SSID(s) — placeholder "12345678" used. Update the password on the controller before enabling: ${config.pskPlaceholders.join(', ')}`,
      'warn'
    );
  }
  if (config.ppskWarnings.length > 0) {
    log(
      `Warning: PPSK key unavailable for ${config.ppskWarnings.length} SSID(s) — placeholder "12345678" used. Update keys on the controller: ${config.ppskWarnings.join(', ')}`,
      'warn'
    );
  }
  if (config.radiusSecretWarnings.length > 0) {
    log(
      `Warning: RADIUS shared secret not returned by XIQ for ${config.radiusSecretWarnings.length} server(s) — AAA policy created but authentication will fail until secrets are set on the controller: ${config.radiusSecretWarnings.join(', ')}`,
      'warn'
    );
  }

  if (options.dryRun) {
    log('DRY RUN — no changes will be made to the controller', 'warn');
    log(
      `Would post: ${config.topologies.length} topologies, ${config.aaaPolicies.length} AAA policies, ${config.services.length} services`
    );
    return result;
  }

  try {
    throwIfAborted(options.signal);

    // 1. Topologies
    for (const topology of config.topologies) {
      throwIfAborted(options.signal);
      log(`Creating topology: ${topology.name} (VLAN ${topology.vlanid})`);
      const r = await controllerPostWithRetry(
        '/v1/topologies',
        topology,
        retryAttempts,
        options.signal
      );
      if (r.ok) {
        result.topologies.succeeded++;
        log(`  ✓ Created${r.attemptsUsed > 1 ? ` (after ${r.attemptsUsed} attempts)` : ''}`);
      } else {
        result.topologies.failed++;
        log(`  ✗ ${r.error}`, 'error');
      }
    }
    if (result.topologies.skipped > 0)
      log(`Skipped ${result.topologies.skipped} existing topology/topologies`);

    // 2. AAA Policies
    for (const policy of config.aaaPolicies) {
      throwIfAborted(options.signal);
      log(`Creating AAA policy: ${policy.name}`);
      const r = await controllerPostWithRetry(
        '/v1/aaapolicy',
        policy,
        retryAttempts,
        options.signal
      );
      if (r.ok) {
        result.aaaPolicies.succeeded++;
        log(`  ✓ Created${r.attemptsUsed > 1 ? ` (after ${r.attemptsUsed} attempts)` : ''}`);
      } else {
        result.aaaPolicies.failed++;
        log(`  ✗ ${r.error}`, 'error');
      }
    }

    // 3. Services + collect IDs for profile assignment
    const createdServiceIds: string[] = [];
    for (const service of config.services) {
      throwIfAborted(options.signal);
      const name = service.serviceName as string;
      log(`Creating service: ${name}`);
      const r = await controllerPostWithRetry(
        '/v1/services',
        service,
        retryAttempts,
        options.signal
      );
      if (r.ok) {
        result.services.succeeded.push(name);
        if (r.id) createdServiceIds.push(r.id);
        log(`  ✓ Created${r.attemptsUsed > 1 ? ` (after ${r.attemptsUsed} attempts)` : ''}`);
      } else {
        result.services.failed.push({ name, error: r.error ?? 'Unknown' });
        log(`  ✗ ${r.error}`, 'error');
      }
    }

    // 4. Profile assignment
    if (options.profileAssignmentMode !== 'none' && createdServiceIds.length > 0) {
      const targetProfiles =
        options.profileAssignmentMode === 'custom' ? profiles.filter((p) => p.isCustom) : profiles;
      log(
        `Assigning ${createdServiceIds.length} SSID(s) to ${targetProfiles.length} profile(s)...`
      );
      for (const profile of targetProfiles) {
        throwIfAborted(options.signal);
        try {
          const getRes = await apiService.makeAuthenticatedRequest(
            `/v3/profiles/${profile.id}`,
            {},
            10000
          );
          if (!getRes.ok) {
            result.profileAssignments.failed++;
            continue;
          }
          const profileData = (await getRes.json()) as Record<string, unknown>;
          const existing = (profileData.radioIfList ?? []) as {
            serviceId: string;
            index: number;
          }[];
          const existingIds = new Set(existing.map((r) => r.serviceId));
          const newEntries = createdServiceIds
            .filter((id) => !existingIds.has(id))
            .map((id) => ({ serviceId: id, index: 0 }));
          profileData.radioIfList = [...existing, ...newEntries];
          const putRes = await apiService.makeAuthenticatedRequest(
            `/v3/profiles/${profile.id}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(profileData),
            },
            15000
          );
          if (putRes.ok) {
            result.profileAssignments.updated++;
            log(`  ✓ ${profile.name}`);
          } else {
            result.profileAssignments.failed++;
            log(`  ✗ ${profile.name}`, 'warn');
          }
        } catch (err) {
          if (err instanceof MigrationAbortedError) throw err;
          result.profileAssignments.failed++;
          log(`  ✗ ${profile.name}: ${err instanceof Error ? err.message : 'error'}`, 'warn');
        }
      }
    }

    // 5. Enable services
    if (options.enableAfterMigration && createdServiceIds.length > 0) {
      throwIfAborted(options.signal);
      log('Enabling migrated SSIDs...');
      try {
        const getRes = await apiService.makeAuthenticatedRequest('/v1/services', {}, 12000);
        if (getRes.ok) {
          const all = (await getRes.json()) as Record<string, unknown>[];
          const toEnable = all.filter(
            (s) => createdServiceIds.includes(s.id as string) && s.status === 'disabled'
          );
          for (const svc of toEnable) {
            throwIfAborted(options.signal);
            svc.status = 'enabled';
            await apiService.makeAuthenticatedRequest(
              `/v1/services/${svc.id}`,
              {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(svc),
              },
              10000
            );
          }
          log(`Enabled ${toEnable.length} service(s)`);
        }
      } catch (err) {
        if (err instanceof MigrationAbortedError) throw err;
        log(
          `Warning: could not enable services — ${err instanceof Error ? err.message : 'error'}`,
          'warn'
        );
      }
    }
  } catch (err) {
    if (err instanceof MigrationAbortedError) {
      result.aborted = true;
      log('Migration aborted by user — partial state was applied', 'warn');
      return result;
    }
    throw err;
  }

  return result;
}

// ─── PDF Report Download ──────────────────────────────────────────────────────

const BRAND_PURPLE = [106, 90, 205] as [number, number, number]; // #6a5acd — Extreme purple
const BRAND_DARK = [30, 30, 46] as [number, number, number];
const SUCCESS_GREEN = [34, 197, 94] as [number, number, number];
const WARN_AMBER = [234, 179, 8] as [number, number, number];
const FAIL_RED = [239, 68, 68] as [number, number, number];

function addSectionHeader(doc: jsPDF, title: string, y: number): number {
  doc.setFillColor(...BRAND_PURPLE);
  doc.rect(14, y, 182, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 17, y + 5.5);
  doc.setTextColor(0, 0, 0);
  return y + 12;
}

function checkPageBreak(doc: jsPDF, y: number, needed = 20): number {
  if (y + needed > 275) {
    doc.addPage();
    return 20;
  }
  return y;
}

export function downloadMigrationReport(
  data: XIQMigrationData,
  result?: MigrationResult,
  selectedSsidIds?: Set<string>
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 19).replace('T', ' ');
  const filename = `XIQ_Migration_${now.toISOString().slice(0, 19).replace(/:/g, '-')}.pdf`;

  // ── Cover header ──────────────────────────────────────────────────────────
  doc.setFillColor(...BRAND_DARK);
  doc.rect(0, 0, 210, 38, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('XIQ Migration Report', 14, 18);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${timestamp}`, 14, 26);
  doc.text('AURA — Autonomous Unified Radio Agent', 14, 32);
  doc.setTextColor(0, 0, 0);

  let y = 48;

  // ── Migration result summary (if available) ───────────────────────────────
  if (result) {
    y = addSectionHeader(doc, 'Migration Summary', y);

    const statusColor = (n: number, bad = false): [number, number, number] =>
      n === 0 ? [120, 120, 120] : bad ? FAIL_RED : SUCCESS_GREEN;

    const summaryRows = [
      [
        'Topologies Created',
        String(result.topologies.succeeded),
        String(result.topologies.skipped),
        String(result.topologies.failed),
      ],
      [
        'AAA Policies Created',
        String(result.aaaPolicies.succeeded),
        '—',
        String(result.aaaPolicies.failed),
      ],
      [
        'Services (SSIDs) Created',
        String(result.services.succeeded.length),
        '—',
        String(result.services.failed.length),
      ],
      [
        'Profile Assignments',
        String(result.profileAssignments.updated),
        '—',
        String(result.profileAssignments.failed),
      ],
    ];

    autoTable(doc, {
      startY: y,
      head: [['Object', 'Succeeded', 'Skipped', 'Failed']],
      body: summaryRows,
      headStyles: { fillColor: BRAND_PURPLE, textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'center' },
      },
      styles: { fontSize: 9 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

    // Failed services
    if (result.services.failed.length > 0) {
      y = checkPageBreak(doc, y, 30);
      y = addSectionHeader(doc, 'Failed Services', y);
      autoTable(doc, {
        startY: y,
        head: [['SSID Name', 'Error']],
        body: result.services.failed.map((f) => [f.name, f.error]),
        headStyles: { fillColor: FAIL_RED, textColor: [255, 255, 255] },
        styles: { fontSize: 8 },
        margin: { left: 14, right: 14 },
      });
      y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    }
  }

  // ── SSIDs ─────────────────────────────────────────────────────────────────
  const migratedSsids = selectedSsidIds
    ? data.ssids.filter((s) => selectedSsidIds.has(s.id))
    : data.ssids;

  y = checkPageBreak(doc, y, 30);
  y = addSectionHeader(doc, `Migrated SSIDs (${migratedSsids.length})`, y);

  if (migratedSsids.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['SSID Name', 'Security', 'WPA', 'VLAN', 'Broadcast', 'Fast Roam', 'PSK Note']],
      body: migratedSsids.map((s) => [
        s.name,
        s.security.type.toUpperCase(),
        s.security.wpa_version,
        s.vlan_id ? String(s.vlan_id) : '—',
        s.broadcast_ssid ? 'Yes' : 'No',
        s.fast_roaming ? 'Yes' : 'No',
        s.security.type === 'psk'
          ? s.security.psk
            ? 'Included'
            : '⚠ Placeholder: 12345678'
          : s.security.type === 'ppsk'
            ? s.security.psk
              ? 'Included'
              : '⚠ Placeholder: 12345678'
            : '—',
      ]),
      headStyles: { fillColor: BRAND_PURPLE, textColor: [255, 255, 255] },
      columnStyles: {
        6: { fontStyle: 'italic', textColor: [180, 100, 0] },
      },
      styles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // ── VLANs / Topologies ────────────────────────────────────────────────────
  if (data.vlans.length > 0) {
    y = checkPageBreak(doc, y, 30);
    y = addSectionHeader(doc, `VLANs / Topologies (${data.vlans.length})`, y);
    autoTable(doc, {
      startY: y,
      head: [['Name', 'VLAN ID', 'User Profile']],
      body: data.vlans.map((v) => [v.name, String(v.vlan_id), v.user_profile_name || '—']),
      headStyles: { fillColor: BRAND_PURPLE, textColor: [255, 255, 255] },
      styles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // ── RADIUS Servers ────────────────────────────────────────────────────────
  if (data.radius.length > 0) {
    y = checkPageBreak(doc, y, 30);
    y = addSectionHeader(doc, `RADIUS Servers (${data.radius.length})`, y);
    autoTable(doc, {
      startY: y,
      head: [
        ['Name', 'IP Address', 'Auth Port', 'Acct Port', 'Timeout', 'Retries', 'Shared Secret'],
      ],
      body: data.radius.map((r) => [
        r.name,
        r.ip,
        String(r.auth_port),
        String(r.acct_port),
        String(r.timeout),
        String(r.retries),
        r.secret ? '✓ Present' : '⚠ Not returned',
      ]),
      columnStyles: {
        6: { fontStyle: 'italic' },
      },
      headStyles: { fillColor: BRAND_PURPLE, textColor: [255, 255, 255] },
      styles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

    // RADIUS secret warning box
    const radiusNoSecret = data.radius.filter((r) => !r.secret);
    if (radiusNoSecret.length > 0) {
      const boxH = 6 + radiusNoSecret.length * 5 + 6;
      y = checkPageBreak(doc, y, boxH + 4);
      doc.setFillColor(255, 251, 235);
      doc.setDrawColor(...WARN_AMBER);
      doc.roundedRect(14, y, 182, boxH, 2, 2, 'FD');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(146, 64, 14);
      doc.text('⚠  RADIUS Shared Secret — Manual Action Required', 18, y + 5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(
        'XIQ may not return shared secrets via API. The AAA policy was created but RADIUS',
        18,
        y + 10
      );
      doc.text(
        'authentication will fail until the correct secret is entered on the controller:',
        18,
        y + 15
      );
      doc.setTextColor(0, 0, 0);
      radiusNoSecret.forEach((r, i) => {
        doc.text(`• ${r.name}  (${r.ip})`, 20, y + 20 + i * 5);
      });
      y += boxH + 4;
    }
  }

  // ── Devices ───────────────────────────────────────────────────────────────
  if (data.devices.length > 0) {
    y = checkPageBreak(doc, y, 30);
    y = addSectionHeader(doc, `Access Points (${data.devices.length})`, y);
    autoTable(doc, {
      startY: y,
      head: [['Name', 'Serial Number', 'Model', 'Location']],
      body: data.devices.map((d) => [d.name, d.serial_number, d.model, d.location || '—']),
      headStyles: { fillColor: BRAND_PURPLE, textColor: [255, 255, 255] },
      styles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // ── PSK placeholder notice ────────────────────────────────────────────────
  const pskPlaceholderSsids = migratedSsids.filter(
    (s) => s.security.type === 'psk' && !s.security.psk
  );
  if (pskPlaceholderSsids.length > 0) {
    const boxH = 6 + pskPlaceholderSsids.length * 5 + 6;
    y = checkPageBreak(doc, y, boxH + 4);
    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(...WARN_AMBER);
    doc.roundedRect(14, y, 182, boxH, 2, 2, 'FD');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(146, 64, 14);
    doc.text('⚠  PSK Password Placeholder — Update Before Enabling', 18, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(
      'XIQ does not expose PSK keys via API. A placeholder password "12345678" was used.',
      18,
      y + 10
    );
    doc.text(
      'Change this password on the controller for each SSID below before enabling it:',
      18,
      y + 15
    );
    doc.setTextColor(0, 0, 0);
    pskPlaceholderSsids.forEach((s, i) => {
      doc.text(`• ${s.name}`, 20, y + 20 + i * 5);
    });
    y += boxH + 4;
  }

  // ── PPSK placeholder notice ───────────────────────────────────────────────
  const ppskSsids = migratedSsids.filter((s) => s.security.type === 'ppsk' && !s.security.psk);
  if (ppskSsids.length > 0) {
    const boxH = 6 + ppskSsids.length * 5 + 6;
    y = checkPageBreak(doc, y, boxH + 4);
    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(...WARN_AMBER);
    doc.roundedRect(14, y, 182, boxH, 2, 2, 'FD');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(146, 64, 14);
    doc.text('⚠  PPSK Password Placeholder — Update Before Enabling', 18, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(
      'XIQ does not expose PPSK keys via API. A placeholder password "12345678" was used.',
      18,
      y + 10
    );
    doc.text(
      'Update the password on the controller for each SSID below before enabling it:',
      18,
      y + 15
    );
    doc.setTextColor(0, 0, 0);
    ppskSsids.forEach((s, i) => {
      doc.text(`• ${s.name}`, 20, y + 20 + i * 5);
    });
    y += boxH + 4;
  }

  // ── Footer on every page ──────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${i} of ${pageCount}  •  XIQ Migration Report  •  ${timestamp}`, 105, 290, {
      align: 'center',
    });
  }

  doc.save(filename);
}
