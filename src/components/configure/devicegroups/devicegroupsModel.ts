/**
 * Aggregated Device Groups model (PLM ruling §7e, 2026-08-23).
 *
 * A Device Group is a named, reusable binding — one AP platform, one Global
 * Profile, one RF policy — applied to as many Sites as needed. On the wire it
 * lives as per-site records inside `site.deviceGroups[]` (verified live on
 * /management/v3/sites); this module aggregates same-named records across
 * sites into one logical group and plans per-site saves back.
 *
 * Gateway rules encoded here:
 *  1. Homogeneous by AP model — membership filters ap.platformName ===
 *     profile.apPlatform (Profiles are platform-locked).
 *  2. One device group per AP, cluster-wide — a serial claimed by any other
 *     group in any site is excluded from candidate lists.
 *  3. Smart RF vs ACS follows the Profile's feature flags
 *     (RF-MGMT-PROFILE-SMART-RF / RF-MGMT-PROFILE-ACS), not the site mode.
 *
 * Authored content is exactly groupName / profileId / rfMgmtPolicyId /
 * apSerialNumbers; every other wire field is vestigial payload and is
 * round-tripped untouched.
 */
import type { ApProfile, DeviceGroup, RfMgmtPolicy, SiteConfig } from '../../../types/configure';
import { SITE_NAME_RE, newDeviceGroup } from '../sites/siteModel';

/** AP inventory record slice needed for eligibility (GET /v1/aps, verified live). */
export interface DeviceGroupAp {
  serialNumber: string;
  apName: string;
  hardwareType: string;
  platformName: string;
  hostSite: string;
}

/* ── RF kind (rule 3) ─────────────────────────────────────────────────── */

export const SMART_RF_FLAG = 'RF-MGMT-PROFILE-SMART-RF';
export const ACS_FLAG = 'RF-MGMT-PROFILE-ACS';

export type RfKind = 'smartRf' | 'acs' | null;

export const RF_KIND_LABEL: Record<'smartRf' | 'acs', string> = {
  smartRf: 'Smart RF',
  acs: 'ACS',
};

/** The Profile's feature flags decide the RF policy kind — never the site mode. */
export function rfKindForProfile(profile: ApProfile | null | undefined): RfKind {
  if (!profile) return null;
  const features = profile.features ?? [];
  if (features.includes(SMART_RF_FLAG)) return 'smartRf';
  if (features.includes(ACS_FLAG)) return 'acs';
  return null;
}

/** RF policies selectable for a kind (policy.type is 'SmartRf' | 'Acs' live). */
export function rfOptionsForKind(policies: RfMgmtPolicy[], kind: RfKind): RfMgmtPolicy[] {
  if (!kind) return [];
  return policies.filter((p) =>
    kind === 'smartRf'
      ? p.type === 'SmartRf' || p.smartRf != null
      : p.type === 'Acs' || p.acs != null
  );
}

/* ── Aggregation ──────────────────────────────────────────────────────── */

/** One per-site wire record of an aggregated group. */
export interface DeviceGroupInstance {
  siteId: string;
  siteName: string;
  /** Site-level write permission (saving a group PUTs the owning site). */
  siteCanEdit: boolean;
  /** Full wire record — vestigial fields preserved for round-trip. */
  group: DeviceGroup;
}

export interface AggregatedDeviceGroup {
  /** Aggregation key. */
  groupName: string;
  instances: DeviceGroupInstance[];
  /** Distinct profile / RF ids observed across member sites (order of appearance). */
  profileIds: string[];
  rfPolicyIds: string[];
  /** First observed binding — the editor's starting point. */
  profileId: string;
  rfMgmtPolicyId: string;
  /** Member sites resolve to more than one Profile / RF policy — stated, never averaged. */
  profileConflict: boolean;
  rfConflict: boolean;
  siteCount: number;
  apCount: number;
  /** All member sites and group records are editable / deletable. */
  canEdit: boolean;
  canDelete: boolean;
}

/** Aggregate same-named per-site device-group records into logical groups. */
export function aggregateDeviceGroups(sites: SiteConfig[]): AggregatedDeviceGroup[] {
  const byName = new Map<string, AggregatedDeviceGroup>();
  for (const site of sites) {
    for (const group of site.deviceGroups ?? []) {
      const key = group.groupName || '(unnamed)';
      let agg = byName.get(key);
      if (!agg) {
        agg = {
          groupName: key,
          instances: [],
          profileIds: [],
          rfPolicyIds: [],
          profileId: '',
          rfMgmtPolicyId: '',
          profileConflict: false,
          rfConflict: false,
          siteCount: 0,
          apCount: 0,
          canEdit: true,
          canDelete: true,
        };
        byName.set(key, agg);
      }
      agg.instances.push({
        siteId: site.id,
        siteName: site.siteName,
        siteCanEdit: site.canEdit !== false,
        group,
      });
      if (group.profileId && !agg.profileIds.includes(group.profileId)) {
        agg.profileIds.push(group.profileId);
      }
      if (group.rfMgmtPolicyId && !agg.rfPolicyIds.includes(group.rfMgmtPolicyId)) {
        agg.rfPolicyIds.push(group.rfMgmtPolicyId);
      }
      if (site.canEdit === false || group.canEdit === false) agg.canEdit = false;
      if (site.canEdit === false || group.canDelete === false) agg.canDelete = false;
    }
  }
  for (const agg of byName.values()) {
    agg.profileId = agg.profileIds[0] ?? '';
    agg.rfMgmtPolicyId = agg.rfPolicyIds[0] ?? '';
    agg.profileConflict = agg.profileIds.length > 1;
    agg.rfConflict = agg.rfPolicyIds.length > 1;
    agg.siteCount = agg.instances.length;
    agg.apCount = agg.instances.reduce((n, i) => n + (i.group.apSerialNumbers?.length ?? 0), 0);
  }
  return [...byName.values()];
}

/* ── Clone (golden DeviceGroupsView semantics) ────────────────────────── */

/**
 * Unique clone name: `${name}-clone`, then `${name}-clone-2`, `-3`, … deduped
 * against every existing aggregated group name (the aggregation key).
 */
export function cloneName(name: string, existingNames: readonly string[]): string {
  const taken = new Set(existingNames);
  const base = `${name || 'Device Group'}-clone`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export interface DeviceGroupClone {
  /** Editor starting point: the binding under a new name, ZERO member sites. */
  form: AggregatedGroupForm;
  /**
   * Vestigial payload copied from the source's first instance (membership and
   * identity reset) — new per-site records inherit it instead of bare defaults.
   */
  template: DeviceGroup;
}

/**
 * A clone is the binding without its member sites: profile and RF policy are
 * the reusable part, the AP membership is what varies per site — carrying the
 * sites over would assert a placement the operator never chose. The clone
 * exists only in the editor until saved to at least one member site (groups
 * live inside site records on the wire, so a zero-site group cannot persist).
 */
export function buildClonePlan(
  source: AggregatedDeviceGroup,
  existingNames: readonly string[]
): DeviceGroupClone {
  const name = cloneName(source.groupName, existingNames);
  const src = source.instances[0]?.group;
  const template: DeviceGroup = src ? structuredClone(src) : newDeviceGroup();
  template.custId = null;
  template.id = '';
  template.canEdit = true;
  template.canDelete = true;
  template.groupName = name;
  template.profileId = source.profileId;
  template.rfMgmtPolicyId = source.rfMgmtPolicyId;
  template.apSerialNumbers = [];
  return {
    form: {
      groupName: name,
      profileId: source.profileId,
      rfMgmtPolicyId: source.rfMgmtPolicyId,
      instances: [],
    },
    template,
  };
}

/* ── Eligibility (rules 1 + 2) ────────────────────────────────────────── */

export interface SerialClaim {
  groupName: string;
  siteName: string;
}

/**
 * serial → claiming group, across EVERY site (rule 2 is cluster-wide).
 * Instances of the group being edited are excluded via their record ids.
 */
export function buildClaimIndex(
  sites: SiteConfig[],
  excludeGroupIds: ReadonlySet<string>
): Map<string, SerialClaim> {
  const claims = new Map<string, SerialClaim>();
  for (const site of sites) {
    for (const group of site.deviceGroups ?? []) {
      if (excludeGroupIds.has(group.id)) continue;
      for (const sn of group.apSerialNumbers ?? []) {
        if (!claims.has(sn))
          claims.set(sn, { groupName: group.groupName, siteName: site.siteName });
      }
    }
  }
  return claims;
}

export interface ApEligibility {
  /** All APs hosted at the site. */
  inSite: DeviceGroupAp[];
  /** Platform-matched and unclaimed — the candidate list. */
  eligible: DeviceGroupAp[];
  /** Withheld by rule 1 (wrong platform). */
  offPlatform: DeviceGroupAp[];
  /** Withheld by rule 2 (claimed by another group, any site). */
  taken: DeviceGroupAp[];
}

/** Candidate APs at one site for a group bound to `platform`. */
export function apEligibility(
  aps: DeviceGroupAp[],
  siteName: string,
  platform: string,
  claims: Map<string, SerialClaim>
): ApEligibility {
  const inSite = aps.filter((a) => a.hostSite === siteName);
  const offPlatform = platform ? inSite.filter((a) => a.platformName !== platform) : [];
  const onPlatform = platform ? inSite.filter((a) => a.platformName === platform) : inSite;
  const taken = onPlatform.filter((a) => claims.has(a.serialNumber));
  const eligible = onPlatform.filter((a) => !claims.has(a.serialNumber));
  return { inSite, eligible, offPlatform, taken };
}

/* ── Re-platform drop (Profile change) ────────────────────────────────── */

/** Serials that survive a re-platform: AP known and on the new platform. */
export function dropOffPlatformSerials(
  serials: string[],
  apsBySerial: Map<string, DeviceGroupAp>,
  platform: string
): string[] {
  return serials.filter((sn) => {
    const ap = apsBySerial.get(sn);
    return !!ap && (!platform || ap.platformName === platform);
  });
}

/** How many APs across all instances a profile change to `platform` would drop. */
export function countReplatformDrops(
  instances: DeviceGroupInstance[],
  apsBySerial: Map<string, DeviceGroupAp>,
  platform: string
): number {
  return instances.reduce((n, i) => {
    const serials = i.group.apSerialNumbers ?? [];
    return n + (serials.length - dropOffPlatformSerials(serials, apsBySerial, platform).length);
  }, 0);
}

/* ── Editor form + validation ─────────────────────────────────────────── */

export interface AggregatedGroupForm {
  groupName: string;
  profileId: string;
  /** '' when the profile exposes neither Smart RF nor ACS. */
  rfMgmtPolicyId: string;
  instances: DeviceGroupInstance[];
}

export interface DeviceGroupFormErrors {
  name?: string;
  profile?: string;
  rf?: string;
  sites?: string;
}

export function validateAggregatedGroup(
  form: AggregatedGroupForm,
  /** Names of every OTHER aggregated group (unique cluster-wide by aggregation key). */
  otherGroupNames: string[],
  rfKind: RfKind,
  /** Member sites, to catch a per-site sibling name collision on rename. */
  memberSites: SiteConfig[] = []
): DeviceGroupFormErrors {
  const errs: DeviceGroupFormErrors = {};
  const name = String(form.groupName ?? '').trim();
  const memberIds = new Set(form.instances.map((i) => i.group.id));
  if (!name) errs.name = 'Name is required';
  else if (!SITE_NAME_RE.test(form.groupName)) errs.name = 'Name contains invalid characters';
  else if (otherGroupNames.includes(form.groupName))
    errs.name = 'A device group with this name already exists';
  else {
    const collision = memberSites.find((s) =>
      (s.deviceGroups ?? []).some((g) => !memberIds.has(g.id) && g.groupName === form.groupName)
    );
    if (collision)
      errs.name = `Site "${collision.siteName}" already has a different device group with this name`;
  }
  if (!form.profileId) errs.profile = 'Profile is required';
  if (rfKind && !form.rfMgmtPolicyId) errs.rf = `${RF_KIND_LABEL[rfKind]} policy is required`;
  // Groups live inside site records on the wire — a zero-site group cannot persist.
  if (form.instances.length === 0)
    errs.sites = 'A device group is stored inside its member sites — add at least one site';
  return errs;
}

/* ── Save / delete planning (site-by-site) ────────────────────────────── */

export interface SiteSavePlan {
  siteId: string;
  siteName: string;
  /** Next full site payload — everything but deviceGroups round-tripped untouched. */
  site: SiteConfig;
}

/**
 * New per-site record for a site being added: vestigial defaults + the binding.
 * A clone passes its `template` so vestigial payload copies from the source
 * instead of bare defaults; membership always starts empty.
 */
export function createInstanceGroup(
  site: Pick<SiteConfig, 'id'>,
  form: Pick<AggregatedGroupForm, 'groupName' | 'profileId' | 'rfMgmtPolicyId'>,
  template?: DeviceGroup
): DeviceGroup {
  const group = template ? structuredClone(template) : newDeviceGroup();
  group.id = `dg-${site.id}-${Date.now()}`;
  group.groupName = form.groupName;
  group.profileId = form.profileId;
  group.rfMgmtPolicyId = form.rfMgmtPolicyId;
  group.apSerialNumbers = [];
  return group;
}

/**
 * Plan the per-site PUTs for a save. Every member site is written with the
 * group's binding stamped on (this is how a conflict is resolved — the values
 * above apply to every member site); sites removed from membership are
 * written with the record deleted. Vestigial group fields and all other site
 * fields ride along untouched.
 */
export function buildSiteSavePlans(
  sites: SiteConfig[],
  original: AggregatedDeviceGroup | null,
  form: AggregatedGroupForm,
  rfKind: RfKind
): SiteSavePlan[] {
  const memberBySiteId = new Map(form.instances.map((i) => [i.siteId, i]));
  const originalBySiteId = new Map((original?.instances ?? []).map((i) => [i.siteId, i]));
  const plans: SiteSavePlan[] = [];

  for (const site of sites) {
    const member = memberBySiteId.get(site.id);
    const was = originalBySiteId.get(site.id);
    if (!member && !was) continue;

    const next = structuredClone(site);
    const groups = next.deviceGroups ?? [];
    if (member) {
      const stamped: DeviceGroup = {
        ...member.group,
        groupName: form.groupName,
        profileId: form.profileId,
        rfMgmtPolicyId: rfKind ? form.rfMgmtPolicyId : member.group.rfMgmtPolicyId,
      };
      const at = groups.findIndex((g) => g.id === member.group.id);
      if (at >= 0) groups[at] = stamped;
      else groups.push(stamped);
      next.deviceGroups = groups;
    } else if (was) {
      next.deviceGroups = groups.filter((g) => g.id !== was.group.id);
    }
    plans.push({ siteId: site.id, siteName: site.siteName, site: next });
  }
  return plans;
}

/* ── CSV export ───────────────────────────────────────────────────────── */

export const DEVICE_GROUP_CSV_HEADER = [
  'Name',
  'AP Platform',
  'Profile',
  'RF Management',
  'Sites',
  'Access Points',
] as const;

/** RFC 4180 field: quote when needed, escape quotes by doubling. */
function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV of the aggregated list, mirroring the grid: resolved Profile / RF names
 * with a "(conflict)" marker where member sites disagree (stated, never
 * averaged away), plus member-site and total-AP counts.
 */
export function deviceGroupsCsv(
  rows: AggregatedDeviceGroup[],
  profileById: Map<string, ApProfile>,
  rfById: Map<string, RfMgmtPolicy>
): string {
  const lines = [DEVICE_GROUP_CSV_HEADER.map(csvField).join(',')];
  for (const row of rows) {
    const profile = profileById.get(row.profileId);
    const profileName = profile?.name ?? '—';
    const rfName = row.rfMgmtPolicyId ? (rfById.get(row.rfMgmtPolicyId)?.name ?? '—') : '—';
    lines.push(
      [
        csvField(row.groupName),
        csvField(profile?.apPlatform ?? '—'),
        csvField(row.profileConflict ? `${profileName} (conflict)` : profileName),
        csvField(row.rfConflict ? `${rfName} (conflict)` : rfName),
        csvField(row.siteCount),
        csvField(row.apCount),
      ].join(',')
    );
  }
  return lines.join('\n');
}

/** Plan the per-site PUTs that remove every instance of an aggregated group. */
export function buildDeletePlans(
  sites: SiteConfig[],
  record: AggregatedDeviceGroup
): SiteSavePlan[] {
  const bySiteId = new Map(record.instances.map((i) => [i.siteId, i]));
  const plans: SiteSavePlan[] = [];
  for (const site of sites) {
    const inst = bySiteId.get(site.id);
    if (!inst) continue;
    const next = structuredClone(site);
    next.deviceGroups = (next.deviceGroups ?? []).filter((g) => g.id !== inst.group.id);
    plans.push({ siteId: site.id, siteName: site.siteName, site: next });
  }
  return plans;
}
