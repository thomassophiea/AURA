/**
 * The five-rung verification ladder on the real provisioning path.
 *
 * `status` collapses genuinely different outcomes into one word, and the word
 * it picks cannot distinguish "an AP is carrying it" from "we never asked" —
 * both land on `degraded`. These assert the ladder keeps them apart, and that
 * rung 5 stays visibly unmeasured rather than quietly assumed.
 */
import { describe, it, expect, vi } from 'vitest';
import { provisionWlan } from './wlanProvisioningEngine.js';
import { signValidationToken, computePlanHash } from './validationToken.js';
import { canonicalizeIntent } from '../validationEngine/wlanConfigValidator.js';
import { STAGE, RESULT } from './verificationEngine.js';

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

/**
 * @param {object} o
 * @param {string[]} o.apServices  what the AP reports carrying
 * @param {object} [o.created]     the service as the Gateway echoes it back
 */
function stubFetch({ apServices, created = { id: 'svc-new', serviceName: 'Guest', ssid: 'Guest', dot1dPortNumber: 109 } }) {
  let persistedProfile = { ...PROFILE_2_4_5 };
  // The engine generates its own service UUID (crypto.randomUUID), so a single
  // service GET has to be matched STRUCTURALLY — a canned id never matches, and
  // the read-back then silently returns the template list instead, which reads
  // as a name mismatch and fails the run for the wrong reason.
  return vi.fn((url, init) => {
    if (url.includes('/v1/services') && init?.method === 'POST') {
      return Promise.resolve({ ok: true, status: 201, json: async () => created });
    }
    if (url.endsWith('/v1/services')) {
      return Promise.resolve({ ok: true, json: async () => [TEMPLATE_SERVICE] });
    }
    if (/\/v1\/services\/[^/]+$/.test(url)) {
      return Promise.resolve({ ok: true, json: async () => created });
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

async function provision(fetchFn) {
  const { planHash, token } = validToken();
  return provisionWlan({
    intent,
    planHash,
    validationToken: token,
    ephemeralPassword: 'guestwifi1',
    profileIds: ['prof-1'],
    ...opts,
    fetchFn,
    waitFn: () => Promise.resolve(),
  });
}

const at = (ladder, stage) => ladder.stages.find((s) => s.stage === stage);

describe('the provisioning ladder', () => {
  it('reports all five rungs, not a single status word', async () => {
    const result = await provision(stubFetch({ apServices: ['Guest (x2)'] }));
    expect(result.ladder.stages).toHaveLength(5);
    expect(result.ladder.stages.map((s) => s.stage)).toEqual([
      STAGE.REQUEST_ACCEPTED,
      STAGE.CONFIGURATION_DEPLOYED,
      STAGE.DEVICE_RECEIVED,
      STAGE.OPERATIONAL_STATE,
      STAGE.USER_EXPERIENCE,
    ]);
  });

  it('never claims the fix worked, because nothing re-measured the users', async () => {
    // A create-WLAN flow has no before/after population, so rung 5 is
    // unmeasured by construction. Assuming it is the failure being prevented.
    const result = await provision(stubFetch({ apServices: ['Guest (x2)'] }));
    expect(at(result.ladder, STAGE.USER_EXPERIENCE).result).toBe(RESULT.NOT_RUN);
    expect(result.ladder.verdict).not.toBe('verified');
  });

  it('proves the hardware carries it when an AP reports the service', async () => {
    const result = await provision(stubFetch({ apServices: ['Guest (x2)'] }));
    expect(at(result.ladder, STAGE.DEVICE_RECEIVED).result).toBe(RESULT.PASS);
    expect(result.ladder.provenDepth).toBe(4);
  });

  it('catches the silent drop: accepted, read back, and no AP carrying it', async () => {
    // The dominant failure mode of this Gateway, and the one a 201 hides.
    const result = await provision(stubFetch({ apServices: ['SomethingElse'] }));
    expect(at(result.ladder, STAGE.DEVICE_RECEIVED).result).toBe(RESULT.FAIL);
    expect(result.ladder.verdict).toBe('failed');
    expect(result.ladder.stoppedAt).toBe(STAGE.DEVICE_RECEIVED);
    expect(at(result.ladder, STAGE.DEVICE_RECEIVED).detail).toMatch(/silently dropped/);
  });

  it('records that the cipher suite and radio index cannot be verified at all', async () => {
    // An AP reports which SSIDs it carries, not which cipher or radio index the
    // Gateway believes it bound them at. Claiming otherwise would let a silent
    // drop pass as proven.
    const result = await provision(stubFetch({ apServices: ['Guest (x2)'] }));
    expect(at(result.ladder, STAGE.CONFIGURATION_DEPLOYED).note).toMatch(/security/);
    expect(at(result.ladder, STAGE.CONFIGURATION_DEPLOYED).note).toMatch(/radioIndices/);
  });

  it('does not treat a 201 as evidence of anything beyond receipt', async () => {
    const result = await provision(stubFetch({ apServices: ['Guest (x2)'] }));
    expect(at(result.ladder, STAGE.REQUEST_ACCEPTED).detail).toMatch(/nothing more/);
  });

  it('leaves the existing status field untouched', async () => {
    // The ladder is additive: callers and tests reading `status` keep working.
    const result = await provision(stubFetch({ apServices: ['Guest (x2)'] }));
    expect(result.status).toBe('completed');
  });
});
