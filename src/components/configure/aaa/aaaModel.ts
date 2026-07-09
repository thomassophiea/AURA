/**
 * Pure model helpers for the AAA Policies feature (EPB-125 §7).
 *
 * Field truth: audit/controller-spec-v2.json "AAA Policy" + the live records
 * in api/aaapolicy.json / api/defaults/aaapolicy.json. Gap rows A1-A15
 * (aaa-guest-admin-parity.md) drive the semantics implemented here:
 *  - denyOnAuthFailure is a NULLABLE OBJECT (A2/A3): null = off, when on its
 *    members are attempts 1-10 / interval 1-10 / timeout 1-300.
 *  - reauthTimeoutOvr is a number: 0 = off, 60-300 when on (A4).
 *  - Server objects use totalRetries/serverType/pollInterval/peerDiscovery/
 *    trustPoint; accounting default port is 1813 (A5).
 *  - Server lists cap at 4; order = priority (A1).
 */
import type { AaaPolicy, AaaRadiusServer } from '../../../types/configure';

/** Transitional numeric input state ('' while the field is cleared). */
export type Numeric = number | '';

export interface AaaServerForm {
  ipAddress: string;
  sharedSecret: string;
  port: Numeric;
  timeout: Numeric;
  totalRetries: Numeric;
  pollInterval: Numeric;
  peerDiscovery: boolean;
  serverType: string;
  trustPoint: string | null;
}

/** Members of the nullable denyOnAuthFailure object (parity gap A2). */
export interface DenyOnAuthFailureForm {
  attempts: Numeric;
  interval: Numeric;
  timeout: Numeric;
}

/** NAI realm entry — realm name + per-realm ordered server lists (A7). */
export interface NaiRealmEntry {
  realm: string;
  authenticationRadiusServers: AaaServerForm[];
  accountingRadiusServers: AaaServerForm[];
}

export interface AaaPolicyForm {
  id?: string;
  canEdit?: boolean | null;
  canDelete?: boolean | null;
  name: string;
  policyType: string;
  healthCheck: number;
  accountingStart: string;
  attributes: { calledStationId: string; nasIpAddress: string; nasId: string };
  accountingInterimInterval: Numeric;
  includeFramedIp: boolean;
  includeMsgAuth: boolean;
  accountingType: string;
  authenticationType: string;
  reauthTimeoutOvr: Numeric;
  operatorName: string;
  operatorNamespace: string;
  denyOnAuthFailure: DenyOnAuthFailureForm | null;
  naiRealms: NaiRealmEntry[] | null;
  serverPoolingMode: string;
  reportNasLocation: boolean;
  accountingAccessAlg: string;
  naiRouting: boolean;
  eventTimestamp: boolean;
  authenticationRadiusServers: AaaServerForm[];
  accountingRadiusServers: AaaServerForm[];
}

export const MAX_RADIUS_SERVERS = 4;
export const DENY_DEFAULTS: DenyOnAuthFailureForm = { attempts: 5, interval: 5, timeout: 300 };
export const REAUTH_DEFAULT = 60;

export const IP_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
export const AAA_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/;

export function inRange(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/** Controller-exact enums (ids are XCC API values; labels match the controller UI). */
export const AAA_ENUMS = {
  authProto: [
    { id: 'PAP', label: 'PAP' },
    { id: 'CHAP', label: 'CHAP' },
    { id: 'MSCHAP', label: 'MS-CHAP' },
    { id: 'MSCHAP2', label: 'MS-CHAP2' },
    { id: 'EAP', label: 'EAP' },
  ],
  calledStation: [
    { id: 'WiredMacColonSsid', label: 'WIRED MAC COLON SSID' },
    { id: 'Bssid', label: 'BSSID' },
    { id: 'SiteName', label: 'SITE NAME' },
    { id: 'SiteNameColonDeviceGroupName', label: 'SITE NAME COLON DEVICE GROUP NAME' },
    { id: 'Serial', label: 'SERIAL' },
    { id: 'SiteCampus', label: 'SITE CAMPUS' },
    { id: 'SiteRegion', label: 'SITE REGION' },
    { id: 'SiteCity', label: 'SITE CITY' },
  ],
  acctType: [
    { id: 'StartInterimStop', label: 'START-INTERIM-STOP' },
    { id: 'StartStop', label: 'START-STOP' },
  ],
  acctStart: [
    { id: 'NoDelay', label: 'NO DELAY' },
    { id: 'OnAcquiringIP', label: 'ON ACQUIRING IP' },
  ],
  poolMode: [
    { id: 'failover', label: 'Failover' },
    { id: 'loadBalance', label: 'Load Balance' },
  ],
  acctAlg: [
    { id: 'Broadcast', label: 'Broadcast' },
    { id: 'RoundRobin', label: 'Round-Robin' },
  ],
  opNs: [
    { id: 'None', label: 'None' },
    { id: 'Tadig', label: 'Tadig' },
    { id: 'Realm', label: 'Realm' },
    { id: 'E212', label: 'E212' },
    { id: 'OneCC', label: 'OneCC' },
    { id: 'WbaId', label: 'WBAID' },
  ],
  serverType: [
    { id: 'Standard', label: 'Standard' },
    { id: 'Secure', label: 'Secure' },
  ],
} as const;

/** New-server seed: acct servers default to port 1813, auth to 1812 (A5). */
export function newRadiusServer(radiusType: 'auth' | 'acct'): AaaServerForm {
  return {
    ipAddress: '',
    sharedSecret: '',
    port: radiusType === 'acct' ? 1813 : 1812,
    timeout: 5,
    totalRetries: 3,
    pollInterval: 60,
    peerDiscovery: false,
    serverType: 'Standard',
    trustPoint: null,
  };
}

/** Reorder = priority; out-of-bounds moves return the list unchanged. */
export function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return list;
  const next = list.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function removeAt<T>(list: T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

/** index < 0 appends (respecting the 4-server cap for server lists via caller). */
export function upsertAt<T>(list: T[], index: number, item: T): T[] {
  if (index < 0) return [...list, item];
  return list.map((existing, i) => (i === index ? item : existing));
}

/** Auth-server IPs not yet present in the acct list ("add existing auth server IP", A1). */
export function availableAuthIps(auth: AaaServerForm[], acct: AaaServerForm[]): string[] {
  const used = new Set(acct.map((s) => s.ipAddress));
  return auth.map((s) => s.ipAddress).filter((ip) => ip && !used.has(ip));
}

/** Copy an auth server into the acct list with the accounting port 1813 (A1/A5). */
export function copyAuthServerToAcct(
  auth: AaaServerForm[],
  acct: AaaServerForm[],
  ipAddress: string
): AaaServerForm[] {
  if (acct.length >= MAX_RADIUS_SERVERS) return acct;
  const source = auth.find((s) => s.ipAddress === ipAddress);
  if (!source || acct.some((s) => s.ipAddress === ipAddress)) return acct;
  return [...acct, { ...structuredClone(source), port: 1813 }];
}

/** Server dialog validation — controller ranges (A1/A3). */
export function validateRadiusServer(
  server: AaaServerForm,
  radiusType: 'auth' | 'acct'
): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!IP_RE.test(server.ipAddress)) errs.ipAddress = 'A valid IPv4 address is required';
  if (!inRange(server.port, 0, 65535)) errs.port = 'Valid range 0 to 65535';
  if (!inRange(server.totalRetries, 1, 32)) errs.totalRetries = 'Valid range 1 to 32';
  if (!inRange(server.timeout, 1, 360)) errs.timeout = 'Valid range 1 to 360';
  if (radiusType === 'auth' && !inRange(server.pollInterval, 30, 300)) {
    errs.pollInterval = 'Valid range 30 to 300';
  }
  if (!server.sharedSecret || server.sharedSecret.length < 6) {
    errs.sharedSecret = 'Shared secret is required (minimum 6 characters)';
  }
  if (server.serverType === 'Secure' && !server.trustPoint) {
    errs.trustPoint = 'Trust point is required for a Secure server';
  }
  return errs;
}

export function validateRealm(realm: NaiRealmEntry): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!realm.realm.trim()) errs.realm = 'NAI Realm is required';
  return errs;
}

/** Policy-level validation — required/pattern/range set from A3/A4/A9/A10. */
export function validateAaaPolicy(form: AaaPolicyForm): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!form.name.trim()) errs.name = 'Name is required';
  else if (!AAA_NAME_RE.test(form.name)) {
    errs.name = 'Letters, digits, space, dot, dash, underscore only (max 64)';
  }
  if (!IP_RE.test(form.attributes.nasIpAddress)) errs.nasIp = 'A valid IPv4 address is required';
  if (!form.attributes.nasId.trim()) errs.nasId = 'NAS ID is required';
  if (!inRange(form.accountingInterimInterval, 60, 3600)) errs.interim = 'Valid range 60 to 3600';
  if (form.denyOnAuthFailure != null) {
    const deny = form.denyOnAuthFailure;
    if (!inRange(deny.attempts, 1, 10)) errs.denyAttempts = 'Valid range 1 to 10';
    if (!inRange(deny.interval, 1, 10)) errs.denyInterval = 'Valid range 1 to 10';
    if (!inRange(deny.timeout, 1, 300)) errs.denyTimeout = 'Valid range 1 to 300';
  }
  // reauthTimeoutOvr: 0 = off (valid); when on the controller enforces 60-300.
  if (form.reauthTimeoutOvr !== 0 && !inRange(form.reauthTimeoutOvr, 60, 300)) {
    errs.reauth = 'Valid range 60 to 300';
  }
  if (form.naiRouting) {
    for (const realm of form.naiRealms ?? []) {
      if (Object.keys(validateRealm(realm)).length > 0) {
        errs.naiRealms = 'One or more realm entries are invalid';
        break;
      }
    }
  }
  return errs;
}

/** True when the deny reveal is checked — presence of the nullable object (A2). */
export function isDenyEnabled(form: AaaPolicyForm): boolean {
  return form.denyOnAuthFailure != null;
}

/** Toggle deny: on seeds in-range defaults, off emits null (A2/A3). */
export function setDenyEnabled(form: AaaPolicyForm, enabled: boolean): AaaPolicyForm {
  return { ...form, denyOnAuthFailure: enabled ? { ...DENY_DEFAULTS } : null };
}

/** True when override-reauth is checked — reauthTimeoutOvr > 0 (A4). */
export function isReauthEnabled(form: AaaPolicyForm): boolean {
  return typeof form.reauthTimeoutOvr === 'number' && form.reauthTimeoutOvr > 0;
}

/** Toggle override-reauth: on seeds the in-range default 60, off writes 0 (A4). */
export function setReauthEnabled(form: AaaPolicyForm, enabled: boolean): AaaPolicyForm {
  return { ...form, reauthTimeoutOvr: enabled ? REAUTH_DEFAULT : 0 };
}

/** The "Local onboarding" policy carries controller-side lockdowns (A9). */
export function isOnboardPolicy(record: Pick<AaaPolicy, 'name'> | null): boolean {
  return record?.name === 'Local onboarding';
}

/** Build the editable form from an API record (or the /default seed). */
export function fromAaaRecord(record: AaaPolicy): AaaPolicyForm {
  const clone = structuredClone(record) as unknown as AaaPolicyForm;
  // denyOnAuthFailure arrives as null or an object; a legacy boolean true is
  // normalized to the in-range defaults so the reveal renders coherently.
  const deny: unknown = clone.denyOnAuthFailure;
  if (deny == null) clone.denyOnAuthFailure = null;
  else if (typeof deny !== 'object') clone.denyOnAuthFailure = { ...DENY_DEFAULTS };
  clone.naiRealms = Array.isArray(clone.naiRealms) ? clone.naiRealms : null;
  clone.authenticationRadiusServers = clone.authenticationRadiusServers ?? [];
  clone.accountingRadiusServers = clone.accountingRadiusServers ?? [];
  clone.attributes = clone.attributes ?? { calledStationId: '', nasIpAddress: '', nasId: '' };
  return clone;
}

/**
 * Convert a validated form back to the API payload. The published AaaPolicy
 * type observed denyOnAuthFailure only as null, so the populated object shape
 * is cast (parity doc A2 confirms the wire shape is a nullable object).
 */
export function toAaaPayload(form: AaaPolicyForm): Partial<AaaPolicy> {
  const payload = structuredClone(form);
  // When NAI routing is on the controller routes per-realm; the flat server
  // lists are not used. When off, naiRealms must go back as null.
  if (!payload.naiRouting) payload.naiRealms = null;
  return payload as unknown as Partial<AaaPolicy>;
}

/** Typed cast for grid rows: API server entries are structurally AaaServerForm. */
export function serversOf(list: AaaRadiusServer[] | undefined): AaaServerForm[] {
  return (list ?? []) as unknown as AaaServerForm[];
}
