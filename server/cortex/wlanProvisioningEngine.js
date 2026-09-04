/**
 * WLAN provisioning executor — the AI-First discipline in Node.
 *
 * Ports the exact rules from the `ai-first` skill (references/gotchas.md,
 * references/payload-templates.md, scripts/deploy_ssid_to_profiles.py):
 * mirror an existing service instead of inventing a payload, never write
 * `radioIfList` entries at `index: 0`, never trust a `2xx` without a
 * read-back, and surface — never silently retry — the WPA2-PSK-on-6GHz drop.
 *
 * Every write is followed by a read-back; the final AP `services[]` check is
 * the only thing that proves "broadcasting" rather than merely "accepted".
 */

import crypto from 'node:crypto';
import { fetchXcc, requestXcc } from '../validationEngine/xccClient.js';
import { verifyValidationToken } from './validationToken.js';
import { canonicalizeIntent } from '../validationEngine/wlanConfigValidator.js';
import { computePlanHash } from './validationToken.js';

const SIX_GHZ = /6\s*ghz/i;
const PROPAGATION_WAIT_MS = 30_000;

function toArray(val) {
  return Array.isArray(val?.data) ? val.data : Array.isArray(val) ? val : [];
}

function defaultWait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Next unused dot1dPortNumber, ≥101 (gotchas.md: duplicate → 422). */
export function nextServicePort(services) {
  const used = services.map((s) => s.dot1dPortNumber).filter((n) => Number.isInteger(n));
  const max = used.length ? Math.max(...used) : 100;
  return Math.max(101, max + 1);
}

/** Pick the closest security-matching existing service as the mirror template. */
export function pickTemplate(services, mode) {
  const keyFor = {
    wpa2_personal: 'WpaPskElement',
    wpa3_personal: 'WpaSaeElement',
    wpa2_enterprise: 'WpaEnterpriseElement',
    wpa3_enterprise: 'WpaEnterpriseElement',
  }[mode];
  if (keyFor) {
    const match = services.find((s) => s.privacy?.[keyFor]);
    if (match) return match;
  }
  return services[0] ?? null;
}

/** Build the privacy block for the requested security mode (payload-templates.md). */
function buildPrivacy(mode, password) {
  switch (mode) {
    case 'wpa2_personal':
      return { WpaPskElement: { mode: 'aesOnly', pmfMode: 'disabled', presharedKey: password, keyHexEncoded: false } };
    case 'wpa3_personal':
      return {
        WpaSaeElement: {
          pmfMode: 'required',
          presharedKey: password,
          keyHexEncoded: false,
          saeMethod: 'SaeH2e',
          encryption: 'AES_CCM_128',
          akmSuiteSelector: 'AKM8_24',
        },
      };
    case 'owe':
      return {}; // oweAutogen flag carries OWE, set alongside
    case 'open':
      return {};
    case 'wpa2_enterprise':
    case 'wpa3_enterprise':
      return { WpaEnterpriseElement: { mode: 'aesOnly', pmfMode: 'capable', fastTransitionEnabled: false, fastTransitionMdId: 0 } };
    default:
      return {};
  }
}

/** Mirror-then-deviate: clone a known-good template, override only what the intent specifies. */
export function buildServicePayload(intent, template, password, port) {
  const base = template
    ? JSON.parse(JSON.stringify(template))
    : {
        // No existing service to mirror (fresh controller) — minimal viable
        // scaffold from payload-templates.md's "shared scaffolding" section.
        dscp: {
          codePoints: [
            2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 2, 0, 1, 0, 3, 0, 3, 0, 3, 0, 3, 0, 4, 0, 4, 0, 4, 0, 4, 0, 5, 0,
            5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 6, 0, 6, 0, 0, 0, 0, 0, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0,
          ],
        },
        features: ['CENTRALIZED-SITE'],
        vendorSpecificAttributes: ['apName', 'vnsName', 'ssid'],
        defaultTopology: null,
        defaultCoS: null,
        unAuthenticatedUserDefaultRoleID: null,
        authenticatedUserDefaultRoleID: null,
      };

  delete base.id;
  delete base.deviceids;
  delete base.siteids;

  return {
    ...base,
    id: crypto.randomUUID(),
    serviceName: intent.wlanName.slice(0, 64),
    ssid: (intent.ssid ?? intent.wlanName).slice(0, 32),
    status: 'enabled',
    suppressSsid: false,
    dot1dPortNumber: port,
    preAuthenticatedIdleTimeout: base.preAuthenticatedIdleTimeout > 0 ? base.preAuthenticatedIdleTimeout : 300, // gotchas.md: 0 -> 422
    postAuthenticatedIdleTimeout: base.postAuthenticatedIdleTimeout ?? 1800,
    sessionTimeout: base.sessionTimeout ?? 0,
    defaultTopology: intent.resolvedTopologyId ?? base.defaultTopology,
    oweAutogen: intent.security?.mode === 'owe' ? true : (base.oweAutogen ?? false),
    hotspotType: base.hotspotType ?? 'Disabled',
    privacy: buildPrivacy(intent.security?.mode, password),
  };
}

/** Radios eligible for this security mode, per gotchas.md (WPA2-PSK silently drops off 6 GHz). */
function eligibleRadioIndices(radios, securityMode) {
  const dropped = [];
  const indices = [];
  for (const radio of radios ?? []) {
    if (!radio.adminState || !radio.radioIndex) continue; // index:0 / disabled never eligible
    if (securityMode === 'wpa2_personal' && SIX_GHZ.test(radio.radioName ?? '')) {
      dropped.push(radio.radioIndex);
      continue;
    }
    indices.push(radio.radioIndex);
  }
  return { indices: indices.sort((a, b) => a - b), dropped };
}

/** Bind a service to one profile's radioIfList — full GET, mutate, full PUT (partial PUT wipes fields). */
async function bindServiceToProfile(serviceId, profileId, securityMode, opts) {
  const profile = await fetchXcc(`/v3/profiles/${encodeURIComponent(profileId)}`, opts);
  const name = profile.name ?? profileId;
  const { indices, dropped } = eligibleRadioIndices(profile.radios, securityMode);

  if (indices.length === 0) {
    return { profileId, name, status: 'skipped', reason: 'no admin-enabled eligible radios', dropped };
  }

  // Drop stale index:0 entries for this service (legacy bug, gotchas.md) and
  // find which eligible indices are already present (idempotent re-run).
  const existing = (profile.radioIfList ?? []).filter((r) => !(r.serviceId === serviceId && r.index === 0));
  const present = new Set(existing.filter((r) => r.serviceId === serviceId).map((r) => r.index));
  const toAdd = indices.filter((i) => !present.has(i));

  if (toAdd.length === 0) {
    return { profileId, name, status: 'already_bound', boundIndices: [...present], dropped };
  }

  const nextRif = [...existing, ...toAdd.map((index) => ({ serviceId, index }))];
  const result = await requestXcc(`/v3/profiles/${encodeURIComponent(profileId)}`, {
    ...opts,
    method: 'PUT',
    body: { ...profile, radioIfList: nextRif },
  });
  if (!result.ok) {
    return { profileId, name, status: 'failed', httpStatus: result.status, error: result.errorText, dropped };
  }

  // Read back — a 200 here does not prove the entries persisted (gotchas.md).
  const verifyProfile = await fetchXcc(`/v3/profiles/${encodeURIComponent(profileId)}`, opts);
  const persisted = new Set(
    (verifyProfile.radioIfList ?? []).filter((r) => r.serviceId === serviceId).map((r) => r.index)
  );
  const silentlyDropped = toAdd.filter((i) => !persisted.has(i));

  return {
    profileId,
    name,
    status: silentlyDropped.length > 0 ? 'partial' : 'bound',
    boundIndices: [...persisted],
    silentlyDropped,
    dropped,
  };
}

function toArrayLocal(val) {
  return Array.isArray(val?.data) ? val.data : Array.isArray(val) ? val : [];
}

/**
 * Resolve which profiles to bind, from AP/site scope — the operator names a
 * Site (or picks specific APs), never a Profile UUID directly. Deploying to
 * `accessPointIds` scopes to exactly those APs' profiles ("deploy only to
 * selected third-floor APs"); otherwise every profile in use at `siteId`
 * ("deploy it to all APs").
 */
export async function resolveTargetProfiles({ siteId, accessPointIds }, opts) {
  const aps = toArrayLocal(await fetchXcc('/v1/aps', opts));
  const inScope = accessPointIds?.length
    ? aps.filter((ap) => accessPointIds.includes(ap.apSerialNum ?? ap.serialNumber ?? ap.id))
    : aps.filter((ap) => !siteId || ap.siteId === siteId);
  return [...new Set(inScope.map((ap) => ap.apAssignedProfileId ?? ap.profileId).filter(Boolean))];
}

/** Verify live broadcast: `services[]` on the AP is the only thing that proves it, not the profile. */
async function verifyBroadcast(serviceName, apSerials, opts) {
  const results = [];
  for (const serial of apSerials) {
    try {
      const ap = await fetchXcc(`/v1/aps/${encodeURIComponent(serial)}`, opts);
      const broadcasting = (ap.services ?? []).some((s) => String(s).startsWith(serviceName));
      results.push({ apSerial: serial, broadcasting });
    } catch (err) {
      results.push({ apSerial: serial, broadcasting: false, error: err.message });
    }
  }
  return results;
}

/**
 * @param {object} params
 * @param {object} params.intent create_wlan WirelessConfigurationIntent (siteId resolved)
 * @param {string} params.planHash Hash the caller believes matches the approved plan
 * @param {string} params.validationToken Signed token from wlanConfigValidator
 * @param {string} params.ephemeralPassword Plaintext PSK/SAE key — never logged, never returned
 * @param {string[]} [params.profileIds] Explicit profile UUIDs, if already known (tests, redeploy
 *   flows). Omit to auto-resolve from `intent.accessPointIds`/`intent.siteId` — the operator
 *   scopes by Site or AP, never by Profile UUID.
 * @param {string} params.authToken
 * @param {string} params.controllerUrl
 * @param {Function} [params.fetchFn] Injectable transport for tests — threaded through to xccClient
 * @param {(ms:number)=>Promise<void>} [params.waitFn] Injectable for tests
 * @param {number} [params.waitMs]
 */
export async function provisionWlan({
  intent,
  planHash,
  validationToken,
  ephemeralPassword,
  profileIds,
  authToken,
  controllerUrl,
  fetchFn,
  waitFn = defaultWait,
  waitMs = PROPAGATION_WAIT_MS,
}) {
  const opts = { authToken, controllerUrl, fetchFn };

  // Fail closed: the token must verify, must not be expired, and must match
  // BOTH the caller-supplied hash and a hash recomputed from the intent right
  // now — this is what stops a stale/edited intent from riding an old token.
  const verified = verifyValidationToken(validationToken);
  const recomputedHash = computePlanHash(canonicalizeIntent(intent));
  if (!verified || verified.planHash !== planHash || recomputedHash !== planHash) {
    return { status: 'failed', stage: 'authorization', reason: 'invalid_or_stale_validation_token' };
  }

  if (!ephemeralPassword && ['wpa2_personal', 'wpa3_personal'].includes(intent.security?.mode)) {
    return { status: 'failed', stage: 'authorization', reason: 'missing_credential' };
  }

  let services;
  try {
    services = toArray(await fetchXcc('/v1/services', opts));
  } catch (err) {
    return { status: 'failed', stage: 'inspect_existing_state', error: err.message };
  }

  const template = pickTemplate(services, intent.security?.mode);
  const port = nextServicePort(services);
  const payload = buildServicePayload(intent, template, ephemeralPassword, port);

  const created = await requestXcc('/v1/services', { ...opts, method: 'POST', body: payload });
  if (!created.ok) {
    return { status: 'failed', stage: 'create_service', httpStatus: created.status, error: created.errorText };
  }

  // 201 is not the verdict — read back (gotchas.md, ai-first.md "the silent drop").
  let readBack;
  try {
    readBack = await fetchXcc(`/v1/services/${payload.id}`, opts);
  } catch (err) {
    return { status: 'degraded', stage: 'read_back', serviceId: payload.id, error: err.message };
  }
  const nameMismatch = readBack.serviceName !== payload.serviceName || readBack.ssid !== payload.ssid;

  // The operator named a Site or picked specific APs — never a Profile UUID —
  // so resolve the target profiles here unless a caller (tests, or a future
  // "redeploy to these exact profiles" flow) already supplied them.
  let resolvedProfileIds = profileIds;
  if (!resolvedProfileIds) {
    try {
      resolvedProfileIds = await resolveTargetProfiles(intent, opts);
    } catch (err) {
      return { status: 'partial', stage: 'resolve_profiles', serviceId: payload.id, serviceName: payload.serviceName, error: err.message };
    }
  }

  const profileResults = [];
  for (const profileId of resolvedProfileIds) {
    profileResults.push(await bindServiceToProfile(payload.id, profileId, intent.security?.mode, opts));
  }
  const anyProfileFailed = profileResults.some((r) => r.status === 'failed');
  const anySilentDrop = profileResults.some((r) => (r.silentlyDropped ?? []).length > 0);

  await waitFn(waitMs);

  let sampleAps = (intent.accessPointIds ?? []).slice(0, 3);
  if (sampleAps.length === 0) {
    // No explicit AP scope ("deploy to all APs") — sample a few APs at the
    // site so verification still means something rather than being skipped.
    try {
      const aps = toArrayLocal(await fetchXcc('/v1/aps', opts));
      sampleAps = aps
        .filter((ap) => !intent.siteId || ap.siteId === intent.siteId)
        .slice(0, 3)
        .map((ap) => ap.apSerialNum ?? ap.serialNumber ?? ap.id)
        .filter(Boolean);
    } catch {
      sampleAps = [];
    }
  }
  const verification = sampleAps.length ? await verifyBroadcast(payload.serviceName, sampleAps, opts) : [];
  const anyVerifiedBroadcasting = verification.some((v) => v.broadcasting);
  const verificationInconclusive = sampleAps.length === 0;

  let status;
  if (anyProfileFailed) status = 'partial';
  else if (nameMismatch || anySilentDrop) status = 'degraded';
  else if (verificationInconclusive) status = 'degraded';
  else if (!anyVerifiedBroadcasting) status = 'degraded';
  else status = 'completed';

  return {
    status,
    serviceId: payload.id,
    serviceName: payload.serviceName,
    readBack: { nameMismatch, dot1dPortNumber: readBack.dot1dPortNumber },
    profileResults,
    verification,
    notes: [
      ...profileResults.flatMap((r) => (r.dropped ?? []).length
        ? [`${r.name}: 6 GHz radio(s) [${r.dropped.join(',')}] skipped — WPA2-PSK is not valid on 6 GHz (use WPA3-SAE or OWE).`]
        : []),
      ...(verificationInconclusive ? ['No AP scope supplied — broadcast could not be independently verified.'] : []),
    ],
  };
}
