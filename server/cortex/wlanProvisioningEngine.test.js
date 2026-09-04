import { describe, it, expect, vi } from 'vitest';
import {
  provisionWlan,
  nextServicePort,
  pickTemplate,
  buildServicePayload,
  resolveTargetProfiles,
} from './wlanProvisioningEngine.js';
import { signValidationToken, computePlanHash } from './validationToken.js';
import { canonicalizeIntent } from '../validationEngine/wlanConfigValidator.js';

const intent = {
  action: 'create_wlan',
  siteId: 'site-1',
  wlanName: 'Guest',
  ssid: 'Guest',
  vlanId: 40,
  accessPointIds: ['AP1'],
  security: { mode: 'wpa2_personal', credentialReference: '(captured, not echoed)' },
};

function validToken(forIntent = intent) {
  const planHash = computePlanHash(canonicalizeIntent(forIntent));
  const { token } = signValidationToken(planHash);
  return { planHash, token };
}

const TEMPLATE_SERVICE = {
  id: 'svc-template',
  serviceName: 'Skynet',
  ssid: 'Skynet',
  dot1dPortNumber: 108,
  privacy: { WpaPskElement: { mode: 'aesOnly', pmfMode: 'disabled', presharedKey: 'x', keyHexEncoded: false } },
  dscp: { codePoints: new Array(64).fill(0) },
  features: ['CENTRALIZED-SITE'],
  vendorSpecificAttributes: ['apName', 'vnsName', 'ssid'],
  defaultTopology: 'topo-1',
  defaultCoS: 'cos-1',
  unAuthenticatedUserDefaultRoleID: 'role-1',
  authenticatedUserDefaultRoleID: 'role-1',
  preAuthenticatedIdleTimeout: 300,
};

const PROFILE_2_4_5 = {
  id: 'prof-1',
  name: 'Site-A',
  radioIfList: [],
  radios: [
    { radioIndex: 1, radioName: 'Radio 1 - 2.4 GHz', adminState: true },
    { radioIndex: 2, radioName: 'Radio 2 - 5 GHz', adminState: true },
  ],
};

const PROFILE_WITH_6GHZ = {
  ...PROFILE_2_4_5,
  radios: [...PROFILE_2_4_5.radios, { radioIndex: 3, radioName: 'Radio 3 - 6 GHz', adminState: true }],
};

const PROFILE_WITH_ZERO_INDEX = {
  ...PROFILE_2_4_5,
  radios: [...PROFILE_2_4_5.radios, { radioIndex: 0, radioName: 'Radio 0 - bogus', adminState: true }],
};

/** Sequential-response fetch stub for method-aware call sequences. */
function scriptedFetch(responses) {
  let i = 0;
  return vi.fn(() => {
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return Promise.resolve(r);
  });
}

/**
 * A profile GET/PUT stub that actually round-trips whatever `radioIfList`
 * the engine PUTs — the engine generates its own service UUID internally
 * (crypto.randomUUID()), so a test can't pre-bake that id into a canned
 * "verify" response; it has to echo back what was really written, the way
 * the real controller does.
 */
function profileRoundTripFetch({ initialProfile, serviceCreated, apServices }) {
  let persistedProfile = initialProfile;
  return vi.fn((url, init) => {
    if (url.includes('/v1/services') && init?.method === 'POST') {
      return Promise.resolve({ ok: true, json: async () => serviceCreated });
    }
    if (url.endsWith('/v1/services')) {
      return Promise.resolve({ ok: true, json: async () => [TEMPLATE_SERVICE] });
    }
    // GET of a single service by its (engine-generated, unpredictable) id —
    // matched structurally, since the test can't know the UUID in advance.
    // POST is handled above and this stub issues no other /v1/services/* call.
    if (/\/v1\/services\/[^/]+$/.test(url)) {
      return Promise.resolve({ ok: true, json: async () => serviceCreated });
    }
    if (init?.method === 'PUT' && url.includes('/v3/profiles')) {
      persistedProfile = JSON.parse(init.body);
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }
    if (url.includes('/v3/profiles')) {
      return Promise.resolve({ ok: true, json: async () => persistedProfile });
    }
    if (url.includes('/v1/aps/')) {
      return Promise.resolve({ ok: true, json: async () => ({ services: apServices }) });
    }
    return Promise.resolve({ ok: false, status: 404, statusText: 'unstubbed', text: async () => 'unstubbed' });
  });
}

const opts = { authToken: 'tok', controllerUrl: 'https://ctrl.local' };

describe('provisionWlan — token verification (fail closed)', () => {
  it('refuses to provision with an invalid token', async () => {
    const result = await provisionWlan({
      intent,
      planHash: 'not-real',
      validationToken: 'garbage.garbage',
      ephemeralPassword: 'guestwifi1',
      profileIds: [],
      ...opts,
      waitFn: () => Promise.resolve(),
    });
    expect(result.status).toBe('failed');
    expect(result.stage).toBe('authorization');
  });

  it('refuses to provision when the intent was edited after validation (hash no longer matches)', async () => {
    const { planHash, token } = validToken();
    const editedIntent = { ...intent, wlanName: 'GuestV2' };
    const result = await provisionWlan({
      intent: editedIntent,
      planHash,
      validationToken: token,
      ephemeralPassword: 'guestwifi1',
      profileIds: [],
      ...opts,
      waitFn: () => Promise.resolve(),
    });
    expect(result.status).toBe('failed');
    expect(result.reason).toBe('invalid_or_stale_validation_token');
  });

  it('refuses a personal-security WLAN with no credential supplied', async () => {
    const { planHash, token } = validToken();
    const result = await provisionWlan({
      intent,
      planHash,
      validationToken: token,
      profileIds: [],
      ...opts,
      waitFn: () => Promise.resolve(),
    });
    expect(result.status).toBe('failed');
    expect(result.reason).toBe('missing_credential');
  });
});

describe('provisionWlan — end to end happy path', () => {
  it('creates the service, binds eligible radios, verifies broadcast, reports completed', async () => {
    const { planHash, token } = validToken();
    const fetchFn = profileRoundTripFetch({
      initialProfile: PROFILE_2_4_5,
      serviceCreated: { id: 'svc-new', serviceName: 'Guest', ssid: 'Guest', dot1dPortNumber: 109 },
      apServices: ['Guest (x2)'],
    });

    const result = await provisionWlan({
      intent,
      planHash,
      validationToken: token,
      ephemeralPassword: 'guestwifi1',
      profileIds: ['prof-1'],
      ...opts,
      fetchFn,
      waitFn: () => Promise.resolve(),
    });

    expect(result.status).toBe('completed');
    expect(result.profileResults[0].status).toBe('bound');
    expect(result.profileResults[0].boundIndices.sort()).toEqual([1, 2]);
    expect(result.verification[0].broadcasting).toBe(true);
  });

  it('never writes a radioIfList entry at index 0, even if the profile exposes a bogus radio 0', async () => {
    const { planHash, token } = validToken();
    let putBody = null;
    const fetchFn = vi.fn((url, init) => {
      if (url.includes('/v1/services') && (!init || init.method === undefined)) {
        return Promise.resolve({ ok: true, json: async () => [TEMPLATE_SERVICE] });
      }
      if (init?.method === 'POST' && url.includes('/v1/services')) {
        return Promise.resolve({ ok: true, json: async () => ({ id: 'svc-new', serviceName: 'Guest', ssid: 'Guest' }) });
      }
      if (url.includes('/v1/services/svc-new')) {
        return Promise.resolve({ ok: true, json: async () => ({ id: 'svc-new', serviceName: 'Guest', ssid: 'Guest', dot1dPortNumber: 109 }) });
      }
      if (init?.method === 'PUT' && url.includes('/v3/profiles')) {
        putBody = init.body;
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      if (url.includes('/v3/profiles/prof-1')) {
        return Promise.resolve({ ok: true, json: async () => (putBody ? JSON.parse(putBody) : PROFILE_WITH_ZERO_INDEX) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ services: [] }) });
    });

    const result = await provisionWlan({
      intent,
      planHash,
      validationToken: token,
      ephemeralPassword: 'guestwifi1',
      profileIds: ['prof-1'],
      ...opts,
      fetchFn,
      waitFn: () => Promise.resolve(),
    });

    const bound = result.profileResults[0];
    expect(bound.boundIndices).not.toContain(0);
    expect(JSON.parse(putBody).radioIfList.some((r) => r.index === 0)).toBe(false);
  });

  it('skips 6 GHz radios for WPA2-PSK and surfaces a note instead of retrying', async () => {
    const { planHash, token } = validToken();
    const fetchFn = profileRoundTripFetch({
      initialProfile: PROFILE_WITH_6GHZ,
      serviceCreated: { id: 'svc-new', serviceName: 'Guest', ssid: 'Guest', dot1dPortNumber: 109 },
      apServices: ['Guest (x2)'],
    });

    const result = await provisionWlan({
      intent,
      planHash,
      validationToken: token,
      ephemeralPassword: 'guestwifi1',
      profileIds: ['prof-1'],
      ...opts,
      fetchFn,
      waitFn: () => Promise.resolve(),
    });

    expect(result.profileResults[0].boundIndices).toEqual([1, 2]);
    expect(result.profileResults[0].dropped).toEqual([3]);
    expect(result.notes.some((n) => n.includes('6 GHz'))).toBe(true);
  });

  it('reports partial when a profile PUT fails', async () => {
    const { planHash, token } = validToken();
    const fetchFn = scriptedFetch([
      { ok: true, json: async () => [TEMPLATE_SERVICE] },
      { ok: true, json: async () => ({ id: 'svc-new', serviceName: 'Guest', ssid: 'Guest' }) },
      { ok: true, json: async () => ({ id: 'svc-new', serviceName: 'Guest', ssid: 'Guest', dot1dPortNumber: 109 }) },
      { ok: true, json: async () => PROFILE_2_4_5 },
      { ok: false, status: 500, statusText: 'Internal Server Error', text: async () => 'boom' },
    ]);

    const result = await provisionWlan({
      intent,
      planHash,
      validationToken: token,
      ephemeralPassword: 'guestwifi1',
      profileIds: ['prof-1'],
      ...opts,
      fetchFn,
      waitFn: () => Promise.resolve(),
    });

    expect(result.status).toBe('partial');
    expect(result.profileResults[0].status).toBe('failed');
  });

  it('reports failed (not completed) when service creation itself fails', async () => {
    const { planHash, token } = validToken();
    const fetchFn = scriptedFetch([
      { ok: true, json: async () => [TEMPLATE_SERVICE] },
      { ok: false, status: 422, statusText: 'Unprocessable', text: async () => 'preAuthenticatedIdleTimeout invalid' },
    ]);

    const result = await provisionWlan({
      intent,
      planHash,
      validationToken: token,
      ephemeralPassword: 'guestwifi1',
      profileIds: ['prof-1'],
      ...opts,
      fetchFn,
      waitFn: () => Promise.resolve(),
    });

    expect(result.status).toBe('failed');
    expect(result.stage).toBe('create_service');
  });
});

describe('resolveTargetProfiles', () => {
  const APS = [
    { apSerialNum: 'AP1', siteId: 'site-1', apAssignedProfileId: 'prof-1' },
    { apSerialNum: 'AP2', siteId: 'site-1', apAssignedProfileId: 'prof-2' },
    { apSerialNum: 'AP3', siteId: 'site-2', apAssignedProfileId: 'prof-3' },
  ];

  it('resolves every profile in use at a site when no AP scope is given ("deploy to all APs")', async () => {
    const fetchFn = vi.fn(() => Promise.resolve({ ok: true, json: async () => APS }));
    const ids = await resolveTargetProfiles({ siteId: 'site-1' }, { ...opts, fetchFn });
    expect(ids.sort()).toEqual(['prof-1', 'prof-2']);
  });

  it('resolves only the named APs\' profiles when accessPointIds is given ("selected third-floor APs")', async () => {
    const fetchFn = vi.fn(() => Promise.resolve({ ok: true, json: async () => APS }));
    const ids = await resolveTargetProfiles({ siteId: 'site-1', accessPointIds: ['AP2'] }, { ...opts, fetchFn });
    expect(ids).toEqual(['prof-2']);
  });
});

describe('provisionWlan — profile auto-resolution', () => {
  it('auto-resolves target profiles from siteId when profileIds is omitted', async () => {
    const { planHash, token } = validToken();
    const APS = [{ apSerialNum: 'AP1', siteId: 'site-1', apAssignedProfileId: 'prof-1' }];
    let fetchFn;
    fetchFn = vi.fn((url, init) => {
      if (url.endsWith('/v1/aps')) return Promise.resolve({ ok: true, json: async () => APS });
      return profileRoundTripFetch({
        initialProfile: PROFILE_2_4_5,
        serviceCreated: { id: 'svc-new', serviceName: 'Guest', ssid: 'Guest', dot1dPortNumber: 109 },
        apServices: ['Guest (x2)'],
      })(url, init);
    });

    const result = await provisionWlan({
      intent,
      planHash,
      validationToken: token,
      ephemeralPassword: 'guestwifi1',
      // profileIds intentionally omitted
      ...opts,
      fetchFn,
      waitFn: () => Promise.resolve(),
    });

    expect(result.profileResults).toHaveLength(1);
    expect(result.profileResults[0].profileId).toBe('prof-1');
  });
});

describe('nextServicePort', () => {
  it('picks max+1, floored at 101', () => {
    expect(nextServicePort([{ dot1dPortNumber: 101 }, { dot1dPortNumber: 107 }])).toBe(108);
    expect(nextServicePort([])).toBe(101);
  });
});

describe('pickTemplate', () => {
  it('mirrors a service matching the requested security mode over an arbitrary first one', () => {
    const saeService = { id: 's2', privacy: { WpaSaeElement: {} } };
    const pskService = { id: 's1', privacy: { WpaPskElement: {} } };
    expect(pickTemplate([saeService, pskService], 'wpa2_personal').id).toBe('s1');
    expect(pickTemplate([saeService, pskService], 'wpa3_personal').id).toBe('s2');
  });

  it('falls back to the first service when no security-matching template exists', () => {
    const onlyOpen = { id: 's3', privacy: {} };
    expect(pickTemplate([onlyOpen], 'wpa2_personal').id).toBe('s3');
  });
});

describe('buildServicePayload', () => {
  it('mirrors the template scaffolding and deviates only the requested fields', () => {
    const payload = buildServicePayload(intent, TEMPLATE_SERVICE, 'guestwifi1', 109);
    expect(payload.id).not.toBe(TEMPLATE_SERVICE.id); // never reuse the template's id
    expect(payload.serviceName).toBe('Guest');
    expect(payload.dot1dPortNumber).toBe(109);
    expect(payload.dscp).toEqual(TEMPLATE_SERVICE.dscp); // mirrored verbatim
    expect(payload.privacy.WpaPskElement.presharedKey).toBe('guestwifi1');
  });

  it('never sends preAuthenticatedIdleTimeout: 0 (gotchas.md: 0 -> 422)', () => {
    const zeroTemplate = { ...TEMPLATE_SERVICE, preAuthenticatedIdleTimeout: 0 };
    const payload = buildServicePayload(intent, zeroTemplate, 'guestwifi1', 109);
    expect(payload.preAuthenticatedIdleTimeout).toBe(300);
  });
});
