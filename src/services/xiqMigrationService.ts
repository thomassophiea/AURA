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
 *   downloadMigrationReport()      → JSON report download
 */

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
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface MigrationResult {
  topologies: { succeeded: number; skipped: number; failed: number };
  aaaPolicies: { succeeded: number; failed: number };
  services: { succeeded: string[]; failed: { name: string; error: string }[] };
  profileAssignments: { updated: number; failed: number };
}

export interface ConvertedConfig {
  topologies: Record<string, unknown>[];
  aaaPolicies: Record<string, unknown>[];
  services: Record<string, unknown>[];
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
  if (security.type === 'psk' || security.type === 'ppsk') {
    if (!security.psk) return null;
    return {
      WpaPskElement: { mode: 'auto', pmfMode, keyHexEncoded: false, presharedKey: security.psk },
    };
  }
  if (security.type === 'dot1x') {
    return { WpaEnterpriseElement: { mode: 'auto', pmfMode } };
  }
  return null;
}

export function convertToControllerFormat(
  data: XIQMigrationData,
  selections: MigrationSelections,
  existingTopologies: Record<string, unknown>[]
): ConvertedConfig {
  const selectedSSIDs = data.ssids.filter((s) => selections.ssidIds.has(s.id));
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
  for (const ssid of selectedSSIDs) {
    const privacy = convertPrivacy(ssid.security);
    if ((ssid.security.type === 'psk' || ssid.security.type === 'ppsk') && privacy === null)
      continue;
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

  return { topologies, aaaPolicies, services };
}

// ─── Migration Execution ──────────────────────────────────────────────────────

async function controllerPost(
  endpoint: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; id?: string; error?: string }> {
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
    return { ok: false, error: errMsg };
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
    services: { succeeded: [], failed: [] },
    profileAssignments: { updated: 0, failed: 0 },
  };

  if (options.dryRun) {
    log('DRY RUN — no changes will be made to the controller', 'warn');
    log(
      `Would post: ${config.topologies.length} topologies, ${config.aaaPolicies.length} AAA policies, ${config.services.length} services`
    );
    return result;
  }

  // 1. Topologies
  for (const topology of config.topologies) {
    log(`Creating topology: ${topology.name} (VLAN ${topology.vlanid})`);
    const r = await controllerPost('/v1/topologies', topology);
    if (r.ok) {
      result.topologies.succeeded++;
      log(`  ✓ Created`);
    } else {
      result.topologies.failed++;
      log(`  ✗ ${r.error}`, 'error');
    }
  }
  if (result.topologies.skipped > 0)
    log(`Skipped ${result.topologies.skipped} existing topology/topologies`);

  // 2. AAA Policies
  for (const policy of config.aaaPolicies) {
    log(`Creating AAA policy: ${policy.name}`);
    const r = await controllerPost('/v1/aaapolicy', policy);
    if (r.ok) {
      result.aaaPolicies.succeeded++;
      log(`  ✓ Created`);
    } else {
      result.aaaPolicies.failed++;
      log(`  ✗ ${r.error}`, 'error');
    }
  }

  // 3. Services + collect IDs for profile assignment
  const createdServiceIds: string[] = [];
  for (const service of config.services) {
    const name = service.serviceName as string;
    log(`Creating service: ${name}`);
    const r = await controllerPost('/v1/services', service);
    if (r.ok) {
      result.services.succeeded.push(name);
      if (r.id) createdServiceIds.push(r.id);
      log(`  ✓ Created`);
    } else {
      result.services.failed.push({ name, error: r.error ?? 'Unknown' });
      log(`  ✗ ${r.error}`, 'error');
    }
  }

  // 4. Profile assignment
  if (options.profileAssignmentMode !== 'none' && createdServiceIds.length > 0) {
    const targetProfiles =
      options.profileAssignmentMode === 'custom' ? profiles.filter((p) => p.isCustom) : profiles;
    log(`Assigning ${createdServiceIds.length} SSID(s) to ${targetProfiles.length} profile(s)...`);
    for (const profile of targetProfiles) {
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
        const existing = (profileData.radioIfList ?? []) as { serviceId: string; index: number }[];
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
        result.profileAssignments.failed++;
        log(`  ✗ ${profile.name}: ${err instanceof Error ? err.message : 'error'}`, 'warn');
      }
    }
  }

  // 5. Enable services
  if (options.enableAfterMigration && createdServiceIds.length > 0) {
    log('Enabling migrated SSIDs...');
    try {
      const getRes = await apiService.makeAuthenticatedRequest('/v1/services', {}, 12000);
      if (getRes.ok) {
        const all = (await getRes.json()) as Record<string, unknown>[];
        const toEnable = all.filter(
          (s) => createdServiceIds.includes(s.id as string) && s.status === 'disabled'
        );
        for (const svc of toEnable) {
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
      log(
        `Warning: could not enable services — ${err instanceof Error ? err.message : 'error'}`,
        'warn'
      );
    }
  }

  return result;
}

// ─── Report Download ──────────────────────────────────────────────────────────

export function downloadMigrationReport(data: XIQMigrationData, result?: MigrationResult): void {
  const report = {
    generated: new Date().toISOString(),
    summary: {
      ssids: data.ssids.length,
      vlans: data.vlans.length,
      radius: data.radius.length,
      devices: data.devices.length,
    },
    ssids: data.ssids.map((s) => ({
      name: s.name,
      security: s.security.type,
      enabled: s.enabled,
      vlan: s.vlan_id,
    })),
    vlans: data.vlans.map((v) => ({ name: v.name, vlan_id: v.vlan_id })),
    radius: data.radius.map((r) => ({ name: r.name, ip: r.ip })),
    devices: data.devices.map((d) => ({ name: d.name, serial: d.serial_number, model: d.model })),
    migrationResult: result ?? null,
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `XIQ_Migration_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
