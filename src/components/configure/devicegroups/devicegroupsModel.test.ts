/**
 * Pure-function tests for the aggregated Device Groups model (PLM §7e):
 * name-keyed aggregation, conflict detection, eligibility (platform rule 1 +
 * cluster-wide claim rule 2), re-platform drop logic, RF kind resolution,
 * validation, and site-by-site save/delete planning with vestigial-field
 * round-trip.
 */
import { describe, expect, it } from 'vitest';
import type { ApProfile, DeviceGroup, RfMgmtPolicy, SiteConfig } from '../../../types/configure';
import {
  ACS_FLAG,
  SMART_RF_FLAG,
  aggregateDeviceGroups,
  apEligibility,
  buildClaimIndex,
  buildClonePlan,
  buildDeletePlans,
  buildSiteSavePlans,
  cloneName,
  countReplatformDrops,
  createInstanceGroup,
  deviceGroupsCsv,
  dropOffPlatformSerials,
  rfKindForProfile,
  rfOptionsForKind,
  validateAggregatedGroup,
  type AggregatedDeviceGroup,
  type AggregatedGroupForm,
  type DeviceGroupAp,
} from './devicegroupsModel';

/* ── fixtures ─────────────────────────────────────────────────────────── */

function makeGroup(over: Partial<DeviceGroup>): DeviceGroup {
  return {
    custId: null,
    id: 'dg-1',
    canDelete: null,
    canEdit: null,
    profileId: 'prof-a',
    groupName: 'INDOOR',
    loadBalanceBandPreferenceEnabled: false,
    roleIDs: null,
    apSerialNumbers: [],
    topologyIDs: null,
    serviceIDs: null,
    backboneTopologyIDs: null,
    radioAssignment: null,
    wiredInterfaceAssignment: null,
    enableDpi: true,
    minimumBaseRate2_4: 6,
    minimumBaseRate5: 6,
    aggregateMpdu2_4: true,
    aggregateMpdu5: true,
    stbcEnabled2_4: false,
    stbcEnabled5: false,
    txbfEnabled2_4: 'muMimo',
    txbfEnabled5: 'disabled',
    rfMgmtPolicyId: 'rf-smart',
    ...over,
  };
}

function makeSite(over: Partial<SiteConfig>): SiteConfig {
  return {
    custId: null,
    id: 'site-1',
    canEdit: true,
    canDelete: true,
    siteName: 'Site One',
    country: 'US',
    postalCode: '',
    distributed: false,
    stpEnabled: false,
    aaaPolicy: null,
    aaaPolicyId: null,
    deviceGroups: [],
    timezone: 'UTC',
    switchSerialNumbers: [],
    siteManagerName: '',
    siteManagerEmail: '',
    contact: '',
    treeNode: {
      custId: null,
      id: null,
      canDelete: null,
      canEdit: null,
      country: 'US',
      region: '',
      campus: '',
      city: '',
      typeOfPlace: null,
      mapCoordinates: '',
    },
    snmpConfig: null,
    features: [],
    proxied: 'Local',
    preferredAffinity: 'Any',
    macAcl: null,
    protectedAcl: null,
    afcUpdate: null,
    apRanging: false,
    ...over,
  };
}

function makeAp(over: Partial<DeviceGroupAp>): DeviceGroupAp {
  return {
    serialNumber: 'SN-1',
    apName: 'AP-1',
    hardwareType: 'AP5020-WW',
    platformName: 'AP5020',
    hostSite: 'Site One',
    ...over,
  };
}

function makeProfile(over: Partial<ApProfile>): ApProfile {
  return {
    id: 'prof-a',
    name: 'AP5020-default',
    apPlatform: 'AP5020',
    features: [SMART_RF_FLAG],
    ...over,
  } as unknown as ApProfile;
}

const siteA = makeSite({
  id: 'site-a',
  siteName: 'Alpha',
  deviceGroups: [
    makeGroup({ id: 'dg-a1', groupName: 'INDOOR', apSerialNumbers: ['SN-1', 'SN-2'] }),
    makeGroup({
      id: 'dg-a2',
      groupName: 'OUTDOOR',
      profileId: 'prof-b',
      rfMgmtPolicyId: 'rf-acs',
      apSerialNumbers: ['SN-3'],
    }),
  ],
});
const siteB = makeSite({
  id: 'site-b',
  siteName: 'Bravo',
  deviceGroups: [makeGroup({ id: 'dg-b1', groupName: 'INDOOR', apSerialNumbers: ['SN-4'] })],
});

/* ── aggregation ──────────────────────────────────────────────────────── */

describe('aggregateDeviceGroups', () => {
  it('merges same-named groups across sites into one row', () => {
    const rows = aggregateDeviceGroups([siteA, siteB]);
    expect(rows).toHaveLength(2);
    const indoor = rows.find((r) => r.groupName === 'INDOOR');
    expect(indoor).toBeDefined();
    expect(indoor!.siteCount).toBe(2);
    expect(indoor!.apCount).toBe(3);
    expect(indoor!.instances.map((i) => i.siteName)).toEqual(['Alpha', 'Bravo']);
    expect(indoor!.profileConflict).toBe(false);
    expect(indoor!.rfConflict).toBe(false);
    expect(indoor!.profileId).toBe('prof-a');
  });

  it('keeps differently-named groups separate', () => {
    const rows = aggregateDeviceGroups([siteA, siteB]);
    const outdoor = rows.find((r) => r.groupName === 'OUTDOOR');
    expect(outdoor!.siteCount).toBe(1);
    expect(outdoor!.apCount).toBe(1);
  });

  it('flags a profile conflict when member sites resolve to different profiles', () => {
    const conflicted = makeSite({
      id: 'site-c',
      siteName: 'Charlie',
      deviceGroups: [makeGroup({ id: 'dg-c1', groupName: 'INDOOR', profileId: 'prof-b' })],
    });
    const indoor = aggregateDeviceGroups([siteA, conflicted]).find(
      (r) => r.groupName === 'INDOOR'
    )!;
    expect(indoor.profileConflict).toBe(true);
    expect(indoor.profileIds).toEqual(['prof-a', 'prof-b']);
    // First observed binding is surfaced — the conflict is stated, not averaged.
    expect(indoor.profileId).toBe('prof-a');
  });

  it('flags an RF conflict when member sites resolve to different policies', () => {
    const conflicted = makeSite({
      id: 'site-c',
      siteName: 'Charlie',
      deviceGroups: [makeGroup({ id: 'dg-c1', groupName: 'INDOOR', rfMgmtPolicyId: 'rf-acs' })],
    });
    const indoor = aggregateDeviceGroups([siteA, conflicted]).find(
      (r) => r.groupName === 'INDOOR'
    )!;
    expect(indoor.rfConflict).toBe(true);
    expect(indoor.rfPolicyIds).toEqual(['rf-smart', 'rf-acs']);
  });

  it('propagates read-only member sites to canEdit/canDelete', () => {
    const locked = makeSite({
      id: 'site-c',
      siteName: 'Charlie',
      canEdit: false,
      deviceGroups: [makeGroup({ id: 'dg-c1', groupName: 'INDOOR' })],
    });
    const indoor = aggregateDeviceGroups([siteA, locked]).find((r) => r.groupName === 'INDOOR')!;
    expect(indoor.canEdit).toBe(false);
    expect(indoor.canDelete).toBe(false);
  });
});

/* ── RF kind (rule 3) ─────────────────────────────────────────────────── */

describe('rfKindForProfile', () => {
  it('follows the profile feature flags, Smart RF first', () => {
    expect(rfKindForProfile(makeProfile({ features: [SMART_RF_FLAG] }))).toBe('smartRf');
    expect(rfKindForProfile(makeProfile({ features: [ACS_FLAG] }))).toBe('acs');
    expect(rfKindForProfile(makeProfile({ features: [] }))).toBeNull();
    expect(rfKindForProfile(null)).toBeNull();
  });

  it('filters RF policy options by kind', () => {
    const policies = [
      { id: 'rf-smart', name: 'HQ Smart RF', type: 'SmartRf', smartRf: {}, acs: null },
      { id: 'rf-acs', name: 'Default ACS', type: 'Acs', smartRf: null, acs: {} },
    ] as unknown as RfMgmtPolicy[];
    expect(rfOptionsForKind(policies, 'smartRf').map((p) => p.id)).toEqual(['rf-smart']);
    expect(rfOptionsForKind(policies, 'acs').map((p) => p.id)).toEqual(['rf-acs']);
    expect(rfOptionsForKind(policies, null)).toEqual([]);
  });
});

/* ── eligibility (rules 1 + 2) ────────────────────────────────────────── */

describe('apEligibility', () => {
  const aps: DeviceGroupAp[] = [
    makeAp({ serialNumber: 'SN-1', hostSite: 'Alpha' }),
    makeAp({ serialNumber: 'SN-2', hostSite: 'Alpha' }),
    makeAp({
      serialNumber: 'SN-X',
      hostSite: 'Alpha',
      platformName: 'AP4020X',
      hardwareType: 'AP4020X-WW',
    }),
    makeAp({ serialNumber: 'SN-4', hostSite: 'Bravo' }),
  ];

  it('filters to the site and the profile platform (rule 1)', () => {
    const el = apEligibility(aps, 'Alpha', 'AP5020', new Map());
    expect(el.inSite.map((a) => a.serialNumber)).toEqual(['SN-1', 'SN-2', 'SN-X']);
    expect(el.eligible.map((a) => a.serialNumber)).toEqual(['SN-1', 'SN-2']);
    expect(el.offPlatform.map((a) => a.serialNumber)).toEqual(['SN-X']);
  });

  it('excludes serials claimed by ANY other group in ANY site (rule 2)', () => {
    // SN-1 is claimed by OUTDOOR at another site — still excluded here.
    const claims = buildClaimIndex(
      [
        makeSite({
          id: 'site-z',
          siteName: 'Zulu',
          deviceGroups: [
            makeGroup({ id: 'dg-z', groupName: 'OUTDOOR', apSerialNumbers: ['SN-1'] }),
          ],
        }),
      ],
      new Set()
    );
    const el = apEligibility(aps, 'Alpha', 'AP5020', claims);
    expect(el.eligible.map((a) => a.serialNumber)).toEqual(['SN-2']);
    expect(el.taken.map((a) => a.serialNumber)).toEqual(['SN-1']);
  });

  it('does not count the edited group itself as a claimant', () => {
    const claims = buildClaimIndex([siteA, siteB], new Set(['dg-a1', 'dg-b1']));
    // INDOOR's own serials are free; OUTDOOR's SN-3 stays claimed.
    expect(claims.has('SN-1')).toBe(false);
    expect(claims.has('SN-4')).toBe(false);
    expect(claims.get('SN-3')).toEqual({ groupName: 'OUTDOOR', siteName: 'Alpha' });
  });
});

/* ── re-platform drop ─────────────────────────────────────────────────── */

describe('re-platform drop logic', () => {
  const apsBySerial = new Map<string, DeviceGroupAp>([
    ['SN-1', makeAp({ serialNumber: 'SN-1', platformName: 'AP5020' })],
    ['SN-2', makeAp({ serialNumber: 'SN-2', platformName: 'AP4020X' })],
  ]);

  it('keeps only APs matching the new platform', () => {
    expect(dropOffPlatformSerials(['SN-1', 'SN-2'], apsBySerial, 'AP5020')).toEqual(['SN-1']);
    expect(dropOffPlatformSerials(['SN-1', 'SN-2'], apsBySerial, 'AP4020X')).toEqual(['SN-2']);
  });

  it('drops serials no longer present in the inventory', () => {
    expect(dropOffPlatformSerials(['SN-GONE'], apsBySerial, 'AP5020')).toEqual([]);
  });

  it('counts drops across all member instances', () => {
    const instances = aggregateDeviceGroups([siteA, siteB]).find(
      (r) => r.groupName === 'INDOOR'
    )!.instances;
    // Only SN-1 survives (SN-2 wrong platform, SN-4 unknown) → 2 of 3 dropped.
    expect(countReplatformDrops(instances, apsBySerial, 'AP5020')).toBe(2);
  });
});

/* ── validation ───────────────────────────────────────────────────────── */

describe('validateAggregatedGroup', () => {
  const base: AggregatedGroupForm = {
    groupName: 'INDOOR',
    profileId: 'prof-a',
    rfMgmtPolicyId: 'rf-smart',
    instances: aggregateDeviceGroups([siteA]).find((r) => r.groupName === 'INDOOR')!.instances,
  };

  it('accepts a valid form', () => {
    expect(validateAggregatedGroup(base, [], 'smartRf')).toEqual({});
  });

  it('requires at least one member site — a zero-site group cannot persist', () => {
    const errs = validateAggregatedGroup({ ...base, instances: [] }, [], 'smartRf');
    expect(errs.sites).toMatch(/at least one site/);
    expect(validateAggregatedGroup(base, [], 'smartRf').sites).toBeUndefined();
  });

  it('requires a name matching the name pattern, unique across groups', () => {
    expect(validateAggregatedGroup({ ...base, groupName: '' }, [], 'smartRf').name).toBeDefined();
    expect(
      validateAggregatedGroup({ ...base, groupName: '#bad#' }, [], 'smartRf').name
    ).toBeDefined();
    expect(validateAggregatedGroup(base, ['INDOOR'], 'smartRf').name).toMatch(/already exists/);
  });

  it('requires the profile and, when the profile exposes a kind, the RF policy', () => {
    expect(
      validateAggregatedGroup({ ...base, profileId: '' }, [], 'smartRf').profile
    ).toBeDefined();
    expect(validateAggregatedGroup({ ...base, rfMgmtPolicyId: '' }, [], 'smartRf').rf).toMatch(
      /Smart RF/
    );
    expect(validateAggregatedGroup({ ...base, rfMgmtPolicyId: '' }, [], 'acs').rf).toMatch(/ACS/);
    // Neither flag → RF not applicable, not required.
    expect(validateAggregatedGroup({ ...base, rfMgmtPolicyId: '' }, [], null).rf).toBeUndefined();
  });

  it('catches a per-site sibling collision on rename', () => {
    const indoor = aggregateDeviceGroups([siteA, siteB]).find((r) => r.groupName === 'INDOOR')!;
    const form: AggregatedGroupForm = {
      ...base,
      groupName: 'OUTDOOR',
      instances: indoor.instances,
    };
    const errs = validateAggregatedGroup(form, [], 'smartRf', [siteA, siteB]);
    expect(errs.name).toMatch(/Alpha/);
  });
});

/* ── clone (golden DeviceGroupsView semantics) ────────────────────────── */

describe('cloneName', () => {
  it('suggests `${name}-clone` and dedupes with numeric suffixes', () => {
    expect(cloneName('INDOOR', ['INDOOR', 'OUTDOOR'])).toBe('INDOOR-clone');
    expect(cloneName('INDOOR', ['INDOOR', 'INDOOR-clone'])).toBe('INDOOR-clone-2');
    expect(cloneName('INDOOR', ['INDOOR', 'INDOOR-clone', 'INDOOR-clone-2'])).toBe(
      'INDOOR-clone-3'
    );
  });

  it('falls back for an unnamed source', () => {
    expect(cloneName('', [])).toBe('Device Group-clone');
  });
});

describe('buildClonePlan', () => {
  const indoor = () => aggregateDeviceGroups([siteA, siteB]).find((r) => r.groupName === 'INDOOR')!;

  it('copies the binding under a deduped name with zero member sites', () => {
    const plan = buildClonePlan(indoor(), ['INDOOR', 'OUTDOOR']);
    expect(plan.form.groupName).toBe('INDOOR-clone');
    expect(plan.form.profileId).toBe('prof-a');
    expect(plan.form.rfMgmtPolicyId).toBe('rf-smart');
    expect(plan.form.instances).toEqual([]);
  });

  it('dedupes against an existing -clone name', () => {
    expect(buildClonePlan(indoor(), ['INDOOR', 'INDOOR-clone']).form.groupName).toBe(
      'INDOOR-clone-2'
    );
  });

  it('copies vestigial fields into the template with identity and membership reset', () => {
    const plan = buildClonePlan(indoor(), []);
    // Vestigial payload from the source's first instance (makeGroup fixture).
    expect(plan.template.txbfEnabled2_4).toBe('muMimo');
    expect(plan.template.aggregateMpdu5).toBe(true);
    expect(plan.template.minimumBaseRate2_4).toBe(6);
    expect(plan.template.enableDpi).toBe(true);
    // Identity and membership reset.
    expect(plan.template.id).toBe('');
    expect(plan.template.custId).toBeNull();
    expect(plan.template.apSerialNumbers).toEqual([]);
    expect(plan.template.canEdit).toBe(true);
    expect(plan.template.canDelete).toBe(true);
    expect(plan.template.groupName).toBe('INDOOR-clone');
    expect(plan.template.profileId).toBe('prof-a');
    expect(plan.template.rfMgmtPolicyId).toBe('rf-smart');
    // Source records untouched (template is a clone).
    expect(siteA.deviceGroups[0].apSerialNumbers).toEqual(['SN-1', 'SN-2']);
    expect(siteA.deviceGroups[0].id).toBe('dg-a1');
  });

  it('falls back to vestigial defaults when the source has no instances', () => {
    const empty: AggregatedDeviceGroup = { ...indoor(), instances: [] };
    const plan = buildClonePlan(empty, []);
    expect(plan.template).toHaveProperty('enableDpi');
    expect(plan.template).toHaveProperty('txbfEnabled5');
    expect(plan.template.apSerialNumbers).toEqual([]);
  });

  it('per-site records created from the template inherit the vestigial payload', () => {
    const plan = buildClonePlan(indoor(), []);
    const siteC = makeSite({ id: 'site-c', siteName: 'Charlie' });
    const g = createInstanceGroup(siteC, plan.form, plan.template);
    expect(g.txbfEnabled2_4).toBe('muMimo');
    expect(g.minimumBaseRate5).toBe(6);
    expect(g.groupName).toBe('INDOOR-clone');
    expect(g.profileId).toBe('prof-a');
    expect(g.rfMgmtPolicyId).toBe('rf-smart');
    expect(g.apSerialNumbers).toEqual([]);
    expect(g.id).toMatch(/^dg-site-c-/);
  });
});

/* ── CSV export ───────────────────────────────────────────────────────── */

describe('deviceGroupsCsv', () => {
  const profiles = new Map([
    ['prof-a', makeProfile({})],
    ['prof-b', makeProfile({ id: 'prof-b', name: 'AP4020X, outdoor', apPlatform: 'AP4020X' })],
  ]);
  const rf = new Map([
    ['rf-smart', { id: 'rf-smart', name: 'HQ Smart RF' } as unknown as RfMgmtPolicy],
    ['rf-acs', { id: 'rf-acs', name: 'Default "ACS"' } as unknown as RfMgmtPolicy],
  ]);

  it('emits the header and one row per aggregated group, quoting per RFC 4180', () => {
    const rows = aggregateDeviceGroups([siteA, siteB]);
    const lines = deviceGroupsCsv(rows, profiles, rf).split('\n');
    expect(lines[0]).toBe('Name,AP Platform,Profile,RF Management,Sites,Access Points');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('INDOOR,AP5020,AP5020-default,HQ Smart RF,2,3');
    // Comma in the profile name → quoted; quotes in the RF name → doubled.
    expect(lines[2]).toBe('OUTDOOR,AP4020X,"AP4020X, outdoor","Default ""ACS""",1,1');
  });

  it('states conflicts and never averages them away', () => {
    const conflicted = makeSite({
      id: 'site-c',
      siteName: 'Charlie',
      deviceGroups: [
        makeGroup({
          id: 'dg-c1',
          groupName: 'INDOOR',
          profileId: 'prof-b',
          rfMgmtPolicyId: 'rf-acs',
        }),
      ],
    });
    const rows = aggregateDeviceGroups([siteA, conflicted]).filter((r) => r.groupName === 'INDOOR');
    const line = deviceGroupsCsv(rows, profiles, rf).split('\n')[1];
    expect(line).toContain('AP5020-default (conflict)');
    expect(line).toContain('HQ Smart RF (conflict)');
  });

  it('uses an em dash for unresolved lookups and is header-only when empty', () => {
    const rows = aggregateDeviceGroups([siteA, siteB]);
    const missing = deviceGroupsCsv(rows, new Map(), new Map()).split('\n')[1];
    expect(missing).toBe('INDOOR,—,—,—,2,3');
    expect(deviceGroupsCsv([], profiles, rf)).toBe(
      'Name,AP Platform,Profile,RF Management,Sites,Access Points'
    );
  });
});

/* ── save / delete planning ───────────────────────────────────────────── */

describe('buildSiteSavePlans', () => {
  const indoor = () => aggregateDeviceGroups([siteA, siteB]).find((r) => r.groupName === 'INDOOR')!;

  it('stamps the binding onto every member site and round-trips vestigial fields', () => {
    const record = indoor();
    const form: AggregatedGroupForm = {
      groupName: 'INDOOR-RENAMED',
      profileId: 'prof-b',
      rfMgmtPolicyId: 'rf-acs',
      instances: structuredClone(record.instances),
    };
    const plans = buildSiteSavePlans([siteA, siteB], record, form, 'acs');
    expect(plans.map((p) => p.siteId)).toEqual(['site-a', 'site-b']);
    const savedA = plans[0].site.deviceGroups.find((g) => g.id === 'dg-a1')!;
    expect(savedA.groupName).toBe('INDOOR-RENAMED');
    expect(savedA.profileId).toBe('prof-b');
    expect(savedA.rfMgmtPolicyId).toBe('rf-acs');
    // Vestigial payload untouched.
    expect(savedA.txbfEnabled2_4).toBe('muMimo');
    expect(savedA.minimumBaseRate5).toBe(6);
    expect(savedA.enableDpi).toBe(true);
    // Sibling group at the same site untouched.
    expect(plans[0].site.deviceGroups.find((g) => g.id === 'dg-a2')!.groupName).toBe('OUTDOOR');
  });

  it('removes the record from sites dropped from membership', () => {
    const record = indoor();
    const form: AggregatedGroupForm = {
      groupName: 'INDOOR',
      profileId: 'prof-a',
      rfMgmtPolicyId: 'rf-smart',
      instances: record.instances.filter((i) => i.siteId === 'site-a'),
    };
    const plans = buildSiteSavePlans([siteA, siteB], record, form, 'smartRf');
    const planB = plans.find((p) => p.siteId === 'site-b')!;
    expect(planB.site.deviceGroups).toHaveLength(0);
  });

  it('appends a fresh record (vestigial defaults) for a newly added site', () => {
    const record = indoor();
    const siteC = makeSite({ id: 'site-c', siteName: 'Charlie', deviceGroups: [] });
    const added = {
      siteId: 'site-c',
      siteName: 'Charlie',
      siteCanEdit: true,
      group: createInstanceGroup(siteC, {
        groupName: 'INDOOR',
        profileId: 'prof-a',
        rfMgmtPolicyId: 'rf-smart',
      }),
    };
    const form: AggregatedGroupForm = {
      groupName: 'INDOOR',
      profileId: 'prof-a',
      rfMgmtPolicyId: 'rf-smart',
      instances: [...structuredClone(record.instances), added],
    };
    const plans = buildSiteSavePlans([siteA, siteB, siteC], record, form, 'smartRf');
    const planC = plans.find((p) => p.siteId === 'site-c')!;
    expect(planC.site.deviceGroups).toHaveLength(1);
    const g = planC.site.deviceGroups[0];
    expect(g.groupName).toBe('INDOOR');
    expect(g.profileId).toBe('prof-a');
    expect(g.rfMgmtPolicyId).toBe('rf-smart');
    expect(g.apSerialNumbers).toEqual([]);
    // Vestigial defaults present so the wire record is complete.
    expect(g).toHaveProperty('enableDpi');
    expect(g).toHaveProperty('txbfEnabled5');
  });

  it('plans a create (no original) as one PUT per member site only', () => {
    const siteC = makeSite({ id: 'site-c', siteName: 'Charlie', deviceGroups: [] });
    const form: AggregatedGroupForm = {
      groupName: 'NEW-GROUP',
      profileId: 'prof-a',
      rfMgmtPolicyId: 'rf-smart',
      instances: [
        {
          siteId: 'site-c',
          siteName: 'Charlie',
          siteCanEdit: true,
          group: createInstanceGroup(siteC, {
            groupName: 'NEW-GROUP',
            profileId: 'prof-a',
            rfMgmtPolicyId: 'rf-smart',
          }),
        },
      ],
    };
    const plans = buildSiteSavePlans([siteA, siteB, siteC], null, form, 'smartRf');
    expect(plans.map((p) => p.siteId)).toEqual(['site-c']);
  });
});

describe('buildDeletePlans', () => {
  it('removes the record from every member site and nothing else', () => {
    const record = aggregateDeviceGroups([siteA, siteB]).find((r) => r.groupName === 'INDOOR')!;
    const plans = buildDeletePlans([siteA, siteB], record);
    expect(plans.map((p) => p.siteId)).toEqual(['site-a', 'site-b']);
    expect(plans[0].site.deviceGroups.map((g) => g.groupName)).toEqual(['OUTDOOR']);
    expect(plans[1].site.deviceGroups).toHaveLength(0);
    // Originals untouched (plans are clones).
    expect(siteA.deviceGroups).toHaveLength(2);
  });
});
