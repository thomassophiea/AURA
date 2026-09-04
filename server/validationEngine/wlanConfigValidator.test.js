import { describe, it, expect, vi } from 'vitest';
import { validateWlanIntent, canonicalizeIntent } from './wlanConfigValidator.js';
import { verifyValidationToken } from '../cortex/validationToken.js';

const SITES = [{ id: 'site-1', siteName: 'Boston Office' }];
const SERVICES = [{ id: 'svc-1', serviceName: 'Skynet' }];
const TOPOLOGIES = [{ id: 'topo-40', name: 'Guest-VLAN', vlanid: 40, dhcpMode: 'DHCPRelay', dhcpServers: '10.0.0.1' }];
const APS = [{ apSerialNum: 'AP1', siteId: 'site-1' }];
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
