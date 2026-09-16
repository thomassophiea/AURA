import { describe, it, expect, vi } from 'vitest';
import { validateWlanIntent, canonicalizeIntent } from './wlanConfigValidator.js';
import { verifyValidationToken } from '../cortex/validationToken.js';

const SITES = [{ id: 'site-1', siteName: 'Boston Office' }];
const SERVICES = [{ id: 'svc-1', serviceName: 'Skynet' }];
const TOPOLOGIES = [{ id: 'topo-40', name: 'Guest-VLAN', vlanid: 40, dhcpMode: 'DHCPRelay', dhcpServers: '10.0.0.1' }];
/**
 * The REAL shape `/v1/aps/query` returns, captured from the lab Gateway.
 *
 * The previous fixture was `[{ apSerialNum: 'AP1', siteId: 'site-1' }]`, and no
 * Gateway build returns `siteId` on an AP row — the field is `hostSite`, and it
 * holds the site NAME. So the fixture agreed with the validator's filter and
 * the test passed while the production check could never match a single AP.
 * Every WLAN creation was blocked with "No APs found" against a site with eight
 * healthy APs, and the suite was green throughout.
 */
const APS = [
  { serialNumber: 'CV012408S-C0102', apName: 'AP5020-PVT-01', hostSite: 'Boston Office', status: 'InService' },
  { serialNumber: 'CV012408S-C0078', apName: 'AP5020-PVT-03', hostSite: 'Boston Office', status: 'InService' },
];
const PROFILES = [{ name: 'Site-A', radioIfList: [], radios: [{ radioIndex: 1, radioName: 'Radio 1 - 2.4 GHz', adminState: true }] }];

/** URL-dispatching fetch stub — robust to call-order changes, unlike positional mocks. */
function urlFetch(routes) {
  return vi.fn((url) => {
    const match = Object.entries(routes).find(([path]) => url.includes(path));
    if (!match) return Promise.resolve({ ok: false, status: 404, statusText: 'not stubbed', text: async () => 'not stubbed' });
    return Promise.resolve({ ok: true, json: async () => match[1] });
  });
}

const baseIntent = {
  action: 'create_wlan',
  siteName: 'Boston Office',
  wlanName: 'Guest',
  ssid: 'Guest',
  vlanId: 40,
  security: { mode: 'wpa2_personal', credentialReference: '(captured, not echoed)' },
};

const opts = { authToken: 'tok', controllerUrl: 'https://ctrl.local' };

describe('validateWlanIntent', () => {
  it('produces a HIGH-confidence report with a signed, verifiable token when everything checks out', async () => {
    const fetchFn = urlFetch({
      '/v3/sites': SITES,
      '/v1/services': SERVICES,
      '/v1/topologies': TOPOLOGIES,
      '/v1/aps': APS,
      '/v3/profiles': PROFILES,
    });
    const report = await validateWlanIntent(baseIntent, { ...opts, fetchFn });

    expect(report.confidence.blockingIssues).toEqual([]);
    expect(report.validationToken).not.toBeNull();
    const verified = verifyValidationToken(report.validationToken);
    expect(verified.planHash).toBe(report.planHash);
    expect(report.planHash).toBe(computeExpectedHash(baseIntent));
  });

  it('blocks and issues no token when no site was specified (never infer Global)', async () => {
    const fetchFn = urlFetch({ '/v1/services': SERVICES, '/v1/topologies': TOPOLOGIES, '/v3/profiles': PROFILES });
    const report = await validateWlanIntent({ ...baseIntent, siteName: undefined }, { ...opts, fetchFn });

    expect(report.confidence.band).toBe('LOW');
    expect(report.confidence.blockingIssues).toContain('site_exists');
    expect(report.validationToken).toBeNull();
  });

  it('blocks on a duplicate WLAN name', async () => {
    const fetchFn = urlFetch({
      '/v3/sites': SITES,
      '/v1/services': [{ id: 'svc-1', serviceName: 'Guest' }],
      '/v1/topologies': TOPOLOGIES,
      '/v1/aps': APS,
      '/v3/profiles': PROFILES,
    });
    const report = await validateWlanIntent(baseIntent, { ...opts, fetchFn });
    expect(report.confidence.blockingIssues).toContain('wlan_name_conflict');
    expect(report.validationToken).toBeNull();
  });

  it('blocks when the target site has zero APs', async () => {
    const fetchFn = urlFetch({
      '/v3/sites': SITES,
      '/v1/services': SERVICES,
      '/v1/topologies': TOPOLOGIES,
      '/v1/aps': [],
      '/v3/profiles': PROFILES,
    });
    const report = await validateWlanIntent(baseIntent, { ...opts, fetchFn });
    expect(report.confidence.blockingIssues).toContain('ap_model_support');
  });

  it('warns (does not block) on WPA2-PSK aimed at a profile with a 6 GHz radio', async () => {
    const profilesWith6ghz = [
      { name: 'Site-A', radioIfList: [], radios: [{ radioIndex: 3, radioName: 'Radio 3 - 6 GHz', adminState: true }] },
    ];
    const fetchFn = urlFetch({
      '/v3/sites': SITES,
      '/v1/services': SERVICES,
      '/v1/topologies': TOPOLOGIES,
      '/v1/aps': APS,
      '/v3/profiles': profilesWith6ghz,
    });
    const report = await validateWlanIntent(baseIntent, { ...opts, fetchFn });
    expect(report.checks.find((c) => c.name === 'band_compatibility').result).toBe('warn');
  });

  it('fails closed to LOW/no-token when the controller is unreachable', async () => {
    const fetchFn = vi.fn(() => Promise.reject(new Error('ECONNREFUSED')));
    const report = await validateWlanIntent(baseIntent, { ...opts, fetchFn });
    expect(report.validationToken).toBeNull();
  });
});

describe('canonicalizeIntent', () => {
  it('excludes the plaintext credential but reflects whether one was supplied', () => {
    const c1 = canonicalizeIntent({ ...baseIntent });
    expect(JSON.stringify(c1)).not.toContain('presharedKey');
    expect(c1.hasCredential).toBe(true);
  });

  it('is order-independent for accessPointIds', () => {
    const a = canonicalizeIntent({ ...baseIntent, accessPointIds: ['ap2', 'ap1'] });
    const b = canonicalizeIntent({ ...baseIntent, accessPointIds: ['ap1', 'ap2'] });
    expect(a).toEqual(b);
  });
});

import { computePlanHash } from '../cortex/validationToken.js';
// Confirms the report's planHash is actually the hash of THIS intent, not
// just internally self-consistent — a regression that dropped a field from
// canonicalizeIntent would still pass a same-value comparison against itself.
function computeExpectedHash(intent) {
  return computePlanHash(canonicalizeIntent(intent));
}

describe('ap_scope resolves a site the way the Gateway actually reports it', () => {
  const apsOnly = (aps) =>
    urlFetch({ '/v3/sites': SITES, '/v1/services': SERVICES, '/v1/topologies': TOPOLOGIES, '/v1/aps': aps, '/v3/profiles': PROFILES });
  const check = (report) => report.checks.find((c) => c.name === 'ap_model_support');

  it('matches on hostSite — the only site field an AP row carries', async () => {
    const report = await validateWlanIntent(baseIntent, { ...opts, fetchFn: apsOnly(APS) });
    expect(check(report)).toMatchObject({ result: 'pass' });
    expect(check(report).evidence).toMatch(/2 AP\(s\) found at 'Boston Office', 2 InService/);
  });

  it('matches a display label against a differently punctuated hostSite', async () => {
    // "Aura Lab" from the UI vs "AURA_LAB" in Gateway data — the same building.
    const sites = [{ id: 'site-9', siteName: 'Aura Lab' }];
    const aps = [{ serialNumber: 'X1', hostSite: 'AURA_LAB', status: 'InService' }];
    const fetchFn = urlFetch({ '/v3/sites': sites, '/v1/services': SERVICES, '/v1/topologies': TOPOLOGIES, '/v1/aps': aps, '/v3/profiles': PROFILES });
    const report = await validateWlanIntent({ ...baseIntent, siteName: 'Aura Lab' }, { ...opts, fetchFn });
    expect(check(report)).toMatchObject({ result: 'pass' });
  });

  it('still BLOCKS a site that genuinely has no APs', async () => {
    // The check must keep doing its job — this is not a licence to pass.
    const aps = [{ serialNumber: 'X1', hostSite: 'Somewhere Else', status: 'InService' }];
    const report = await validateWlanIntent(baseIntent, { ...opts, fetchFn: apsOnly(aps) });
    expect(check(report)).toMatchObject({ result: 'block' });
    expect(check(report).evidence).toMatch(/no AP reports hostSite 'Boston Office'/);
  });

  it('WARNS rather than blocks when the APs exist but are all offline', async () => {
    // The WLAN is still correct to create; it goes on air when an AP returns.
    // Blocking would strand a legitimate change, and passing silently would
    // imply it is broadcasting.
    const aps = [{ serialNumber: 'X1', hostSite: 'Boston Office', status: 'Offline' }];
    const report = await validateWlanIntent(baseIntent, { ...opts, fetchFn: apsOnly(aps) });
    expect(check(report)).toMatchObject({ result: 'warn' });
    expect(check(report).evidence).toMatch(/NONE are InService/);
  });

  it('still accepts a build that does report siteId', async () => {
    // The fallback stays, so this is not a swap of one hard-coded field for
    // another.
    const aps = [{ serialNumber: 'X1', siteId: 'site-1', status: 'InService' }];
    const report = await validateWlanIntent(baseIntent, { ...opts, fetchFn: apsOnly(aps) });
    expect(check(report)).toMatchObject({ result: 'pass' });
  });
});
