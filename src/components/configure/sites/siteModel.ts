/**
 * Site editor model (EPB-125 · sites-devicegroups-parity.md). Validation
 * regexes, option lists, clone helper, and the nested device-group factory.
 * Field truth: api/defaults/sites.json + live api/sites-v3.json. Device groups
 * live inside site.deviceGroups; the Allow/Deny lists onto site.macAcl /
 * site.protectedAcl (both null on the wire — list keys macList/ipList inferred).
 */
import type { DeviceGroup, SiteConfig } from '../../../types/configure';

type Dict = Record<string, unknown>;

/** Read a dot-path (numeric segments index arrays). */
export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, key) => {
    if (cur && typeof cur === 'object') return (cur as Dict)[key];
    return undefined;
  }, obj);
}

/** Immutably set a dot-path, cloning the object. */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const next = structuredClone(obj);
  const keys = path.split('.');
  let cur = next as unknown as Dict;
  for (let i = 0; i < keys.length - 1; i += 1) cur = cur[keys[i]] as Dict;
  cur[keys[keys.length - 1]] = value;
  return next;
}

export const SITE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ._()-]*$/;
export const LATLONG_RE =
  /^\s*-?(90(\.0+)?|[0-8]?\d(\.\d+)?)\s*,\s*-?(180(\.0+)?|1[0-7]\d(\.\d+)?|\d{1,2}(\.\d+)?)\s*$/;
export const MAC_RE = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;
export const IP_RE =
  /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

export const PROTECTED_ACL_CAP = 256;

export interface SiteOption {
  id: string;
  label: string;
}

export const TYPE_OF_PLACE: SiteOption[] = [
  { id: 'Campus', label: 'Campus' },
  { id: 'Building', label: 'Building' },
  { id: 'Outdoor', label: 'Outdoor' },
  { id: 'Other', label: 'Other' },
];

export const ADOPTION_PREFERENCE: SiteOption[] = [
  { id: 'Any', label: 'Use global Availability settings' },
  { id: 'Primary', label: 'Primary Appliance' },
  { id: 'Backup', label: 'Backup Appliance' },
];

export const TRAP_SEVERITY: SiteOption[] = [
  { id: 'Critical', label: 'Critical' },
  { id: 'Major', label: 'Major' },
  { id: 'Minor', label: 'Minor' },
  { id: 'Informational', label: 'Info' },
];

export const SNMP_VERSION: SiteOption[] = [
  { id: 'DISABLED', label: 'Disabled' },
  { id: 'V2C', label: 'SNMPv2c' },
  { id: 'V3', label: 'SNMPv3' },
];

export interface MacAcl {
  mode: string; // 'Allow' | 'Deny'
  macList: string[];
}
export interface ProtectedAcl {
  mode: string; // 'Deny' | 'Allow'
  ipList: string[];
}

/** Read a site's macAcl as the editor shape (tolerates the null wire value). */
export function readMacAcl(site: SiteConfig): MacAcl | null {
  const raw = site.macAcl as MacAcl | null;
  if (!raw) return null;
  return { mode: raw.mode ?? 'Allow', macList: Array.isArray(raw.macList) ? raw.macList : [] };
}
export function readProtectedAcl(site: SiteConfig): ProtectedAcl | null {
  const raw = site.protectedAcl as ProtectedAcl | null;
  if (!raw) return null;
  return { mode: raw.mode ?? 'Deny', ipList: Array.isArray(raw.ipList) ? raw.ipList : [] };
}

/** New nested device-group record (matches api/sites.json deviceGroups[] shape). */
export function newDeviceGroup(): DeviceGroup {
  return {
    custId: null,
    id: `dg-${Date.now()}`,
    canDelete: true,
    canEdit: true,
    profileId: '',
    groupName: '',
    loadBalanceBandPreferenceEnabled: false,
    roleIDs: null,
    apSerialNumbers: [],
    topologyIDs: null,
    serviceIDs: null,
    backboneTopologyIDs: null,
    radioAssignment: null,
    wiredInterfaceAssignment: null,
    enableDpi: true,
    minimumBaseRate2_4: 0,
    minimumBaseRate5: 0,
    aggregateMpdu2_4: false,
    aggregateMpdu5: false,
    stbcEnabled2_4: false,
    stbcEnabled5: false,
    txbfEnabled2_4: 'disabled',
    txbfEnabled5: 'disabled',
    rfMgmtPolicyId: '',
  };
}

/** Seed the create scaffold from the controller /default record. */
export function seedSite(def: SiteConfig): SiteConfig {
  const seed = structuredClone(def);
  seed.siteName = '';
  seed.deviceGroups = [];
  seed.canDelete = true;
  seed.canEdit = true;
  return seed;
}

/** Clone a site (new name), regenerating child device-group ids. */
export function cloneSite(site: SiteConfig, name: string): SiteConfig {
  const c = structuredClone(site);
  c.id = `site-clone-${Date.now()}`;
  c.siteName = name;
  c.canDelete = true;
  (c.deviceGroups ?? []).forEach((g, i) => {
    g.id = `${c.id}-dg-${i}`;
  });
  return c;
}

export interface SiteValidationCtx {
  isNew: boolean;
}

export function validateSite(form: SiteConfig, ctx: SiteValidationCtx): Record<string, string> {
  const errs: Record<string, string> = {};
  const name = String(form.siteName ?? '').trim();
  if (!name) errs.name = 'Site name is required';
  else if (!SITE_NAME_RE.test(form.siteName)) errs.name = 'Name contains invalid characters';
  const coord = form.treeNode?.mapCoordinates;
  if (coord && !LATLONG_RE.test(coord))
    errs.coord = 'Enter a valid "latitude, longitude" (e.g. 37.40, -121.95)';
  if (ctx.isNew && form.distributed == null) errs.dist = 'Select the site mode';
  return errs;
}

export interface DgValidationCtx {
  /** Existing group names in the site (excluding the group being edited). */
  siblingNames: string[];
}

export function validateDeviceGroup(
  dg: DeviceGroup,
  ctx: DgValidationCtx
): Record<string, string> {
  const errs: Record<string, string> = {};
  const name = String(dg.groupName ?? '').trim();
  if (!name) errs.name = 'Name is required';
  else if (!SITE_NAME_RE.test(dg.groupName)) errs.name = 'Name contains invalid characters';
  else if (ctx.siblingNames.includes(dg.groupName))
    errs.name = 'A device group with this name already exists';
  if (!dg.profileId) errs.profile = 'Profile is required';
  if (!dg.rfMgmtPolicyId) errs.rf = 'RF Management policy is required';
  return errs;
}
