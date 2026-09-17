import { describe, it, expect } from 'vitest';
import {
  planSiteDeployment,
  bandForRadio,
  sixGhzEligible,
  BAND,
} from './siteDeploymentPlanner.js';

/** Radio modes exactly as the Gateway returns them. */
const R = (index, mode, adminState = true) => ({ radioIndex: index, mode, adminState });
const THREE_RADIO = [R(1, 'gnxbe'), R(2, 'ancxbe'), R(3, 'ax6be')];

const WPA2 = { id: 'svc-1', serviceName: 'Skynet', privacy: { WpaPskElement: { mode: 'aesOnly' } } };
const SAE = { id: 'svc-2', serviceName: 'Skynet_SAE', privacy: { WpaSaeElement: { pmfMode: 'required' } } };
const OPEN = { id: 'svc-3', serviceName: 'AURA-CWP', privacy: {} };

/** The lab estate, including the profile that genuinely spans two sites. */
const APS = [
  { apName: 'AP5020-PVT-01', hostSite: 'PrimarySite', profileName: 'AP5020-INDOOR', profileId: null },
  { apName: 'AP5020-PVT-02', hostSite: 'PrimarySite', profileName: 'AP5020-INDOOR', profileId: null },
  { apName: 'AP4020-PVT-05', hostSite: 'PrimarySite', profileName: 'AP4020X-OUTDOOR', profileId: null },
  { apName: 'EAL-PT-N-5th', hostSite: 'EAL-PT-N', profileName: '5022-N', profileId: null },
  { apName: 'EAL-PT-S-5th', hostSite: 'EAL-PT-S', profileName: '5022-N', profileId: null },
];

const PROFILES = [
  { id: 'p1', name: 'AP5020-INDOOR', apPlatform: 'AP5020', radios: THREE_RADIO, radioIfList: [] },
  { id: 'p2', name: 'AP4020X-OUTDOOR', apPlatform: 'AP4020X', radios: THREE_RADIO, radioIfList: [] },
  { id: 'p3', name: '5022-N', apPlatform: 'AP5022', radios: THREE_RADIO, radioIfList: [] },
];

const plan = (siteName, service = WPA2, over = {}) =>
  planSiteDeployment({ siteName, service, aps: APS, profiles: PROFILES, ...over });

describe('bandForRadio', () => {
  it('reads the band out of the mode, because there is no band field', () => {
    expect(bandForRadio(R(1, 'gnxbe'))).toBe(BAND.GHZ_24);
    expect(bandForRadio(R(2, 'ancxbe'))).toBe(BAND.GHZ_5);
    expect(bandForRadio(R(3, 'ax6be'))).toBe(BAND.GHZ_6);
  });

  it('falls back to 5 GHz on an unknown mode, never to 6', () => {
    // Guessing 6 GHz would let a WPA2 service reach a band that discards it.
    expect(bandForRadio(R(2, 'something-new'))).toBe(BAND.GHZ_5);
    expect(bandForRadio({})).toBe(BAND.GHZ_5);
  });
});

describe('sixGhzEligible', () => {
  it('allows SAE, OWE and WPA3 192-bit', () => {
    expect(sixGhzEligible(SAE)).toBe(true);
    expect(sixGhzEligible({ privacy: { OweElement: {} } })).toBe(true);
    expect(sixGhzEligible({ privacy: { Wpa3Enterprise192bElement: {} } })).toBe(true);
  });

  it('refuses WPA2-PSK and an Open service', () => {
    expect(sixGhzEligible(WPA2)).toBe(false);
    expect(sixGhzEligible(OPEN)).toBe(false);
  });
});

describe('planSiteDeployment — the shared-profile leak', () => {
  it('binds in place when every AP on the profile is inside the site', () => {
    const p = plan('PrimarySite');
    const indoor = p.targets.find((t) => t.profileName === 'AP5020-INDOOR');

    expect(indoor.action).toBe('bind');
    expect(indoor.forkName).toBeNull();
    expect(indoor.protectedSites).toEqual([]);
  });

  it('FORKS a profile that also serves another site', () => {
    // The defect this exists for: 5022-N serves EAL-PT-N and EAL-PT-S, so
    // binding it would light the SSID up at a site nobody asked about.
    const p = plan('EAL-PT-N');
    const shared = p.targets.find((t) => t.profileName === '5022-N');

    expect(shared.action).toBe('fork');
    expect(shared.forkName).toBe('5022-N-EAL-PT-N');
    expect(shared.protectedSites).toEqual(['EAL-PT-S']);
  });

  it('names which site a fork protected, so the reasoning is visible', () => {
    const p = plan('EAL-PT-S');
    const shared = p.targets.find((t) => t.profileName === '5022-N');
    expect(shared.protectedSites).toEqual(['EAL-PT-N']);
    expect(p.blastRadius.forks).toBe(1);
  });

  it('counts the blast radius over the target site only', () => {
    const p = plan('PrimarySite');
    expect(p.blastRadius.aps).toBe(3);
    expect(p.blastRadius.profiles).toBe(2);
    expect(p.blastRadius.forks).toBe(0);
    expect(p.blastRadius.sites).toBe(1);
  });
});

describe('planSiteDeployment — 6 GHz', () => {
  it('excludes a 6 GHz radio for WPA2 and says why', () => {
    const p = plan('PrimarySite', WPA2);
    const t = p.targets[0];

    expect(t.radios.map((r) => r.index)).toEqual([1, 2]);
    const six = t.excluded.find((e) => e.band === BAND.GHZ_6);
    expect(six.index).toBe(3);
    expect(six.reason).toMatch(/WPA3-SAE or OWE/i);
  });

  it('warns once at the top level, not only inside a target', () => {
    const p = plan('PrimarySite', WPA2);
    expect(p.warnings.join(' ')).toMatch(/will not be broadcast on 6 GHz/i);
  });

  it('includes 6 GHz for an SAE service', () => {
    const p = plan('PrimarySite', SAE);
    expect(p.targets[0].radios.map((r) => r.index)).toEqual([1, 2, 3]);
    expect(p.targets[0].excluded).toEqual([]);
    expect(p.warnings.join(' ')).not.toMatch(/6 GHz/i);
  });

  it('excludes an Open service from 6 GHz too', () => {
    const p = plan('PrimarySite', OPEN);
    expect(p.targets[0].radios.map((r) => r.index)).toEqual([1, 2]);
  });

  it('skips a radio that is administratively down', () => {
    const profiles = [
      { id: 'p1', name: 'AP5020-INDOOR', radios: [R(1, 'gnxbe'), R(2, 'ancxbe', false)], radioIfList: [] },
    ];
    const p = planSiteDeployment({ siteName: 'PrimarySite', service: WPA2, aps: APS, profiles });
    const t = p.targets.find((x) => x.profileName === 'AP5020-INDOOR');

    expect(t.radios.map((r) => r.index)).toEqual([1]);
    expect(t.excluded.find((e) => e.index === 2).reason).toMatch(/administratively down/i);
  });

  it('never plans index 0, which the Gateway accepts and drops', () => {
    const p = plan('PrimarySite', SAE);
    for (const t of p.targets) expect(t.radios.map((r) => r.index)).not.toContain(0);
  });
});

describe('planSiteDeployment — idempotence and refusals', () => {
  it('does not re-bind a radio that already carries the service', () => {
    const profiles = [
      {
        id: 'p1',
        name: 'AP5020-INDOOR',
        radios: THREE_RADIO,
        radioIfList: [{ serviceId: 'svc-1', index: 1 }],
      },
    ];
    const p = planSiteDeployment({ siteName: 'PrimarySite', service: WPA2, aps: APS, profiles });
    const t = p.targets.find((x) => x.profileName === 'AP5020-INDOOR');

    expect(t.radios.map((r) => r.index)).toEqual([2]);
    expect(t.alreadyBound).toEqual([1]);
  });

  it('reports an already-deployed WLAN as a no-op, not as a deployment', () => {
    // Found by running the planner against the live estate: Skynet is already
    // bound on every PrimarySite profile, so there was nothing to do — and the
    // plan still said status ok over 4 APs, which a preview would have rendered
    // as a deployment about to happen.
    const profiles = [
      {
        id: 'p1',
        name: 'AP5020-INDOOR',
        radios: THREE_RADIO,
        radioIfList: [
          { serviceId: 'svc-1', index: 1 },
          { serviceId: 'svc-1', index: 2 },
        ],
      },
    ];
    const aps = APS.filter((a) => a.profileName === 'AP5020-INDOOR');
    const p = planSiteDeployment({ siteName: 'PrimarySite', service: WPA2, aps, profiles });

    expect(p.status).toBe('already_deployed');
    expect(p.blastRadius.radios).toBe(0);
    expect(p.warnings.join(' ')).toMatch(/already broadcast|already deployed/i);
  });

  it('does not fork a profile when there is nothing left to bind', () => {
    // Forking re-homes a live AP. Doing that to achieve no change at all is
    // pure blast radius for no benefit.
    const profiles = [
      {
        id: 'p3',
        name: '5022-N',
        radios: [R(1, 'gnxbe'), R(2, 'ancxbe')],
        radioIfList: [
          { serviceId: 'svc-1', index: 1 },
          { serviceId: 'svc-1', index: 2 },
        ],
      },
    ];
    const p = planSiteDeployment({ siteName: 'EAL-PT-N', service: WPA2, aps: APS, profiles });

    expect(p.status).toBe('already_deployed');
    expect(p.blastRadius.forks).toBe(0);
    expect(p.targets.every((t) => t.action === 'none')).toBe(true);
  });

  it('refuses a site name that matches no AP, and lists the ones that exist', () => {
    // Deploying "to nothing" must never read as a successful deployment.
    const p = plan('Warehouse');

    expect(p.status).toBe('site_matched_nothing');
    expect(p.targets).toEqual([]);
    expect(p.blastRadius.aps).toBe(0);
    expect(p.knownSites).toContain('PrimarySite');
    expect(p.warnings[0]).toMatch(/No AP reports hostSite/i);
  });

  it('matches a site case-insensitively', () => {
    expect(plan('primarysite').status).toBe('ok');
  });

  it('reports an AP with no profile rather than skipping it silently', () => {
    const aps = [...APS, { apName: 'ORPHAN', hostSite: 'PrimarySite', profileName: null }];
    const p = planSiteDeployment({ siteName: 'PrimarySite', service: WPA2, aps, profiles: PROFILES });

    expect(p.warnings.join(' ')).toMatch(/ORPHAN reports no profile/i);
  });

  it('reports a profile the Gateway did not return rather than inventing it', () => {
    const p = planSiteDeployment({
      siteName: 'PrimarySite',
      service: WPA2,
      aps: APS,
      profiles: [PROFILES[0]],
    });

    expect(p.warnings.join(' ')).toMatch(/AP4020X-OUTDOOR.*was not returned/i);
    expect(p.targets.map((t) => t.profileName)).not.toContain('AP4020X-OUTDOOR');
  });
});
