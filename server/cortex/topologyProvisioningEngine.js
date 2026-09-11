/**
 * Topology (VLAN) provisioning executor — the AI-First discipline in Node,
 * ported to the second domain after WLAN. Mirrors wlanProvisioningEngine.js's
 * shape (verify the token, mirror-then-deviate, read back, never trust a
 * 2xx) with one domain-specific correction:
 *
 * **The Gateway ignores the client-supplied `id` on `POST /v1/topologies` and
 * assigns its own.** Measured on the lab Gateway 2026-09-11: a topology
 * created with an explicit client UUID came back with a *different*,
 * server-minted `id` in the 201 response body. `/v1/services` (the WLAN
 * domain) honours a client-supplied UUID; `/v1/topologies` does not — this
 * engine reads the id back out of the create response rather than assuming
 * the one it sent, and read-back/verification always addresses the
 * server-assigned id.
 *
 * A second measured fact shapes `topologyConfigValidator.js`, not this file:
 * the Gateway does **not** reject a duplicate `vlanid` — two topologies with
 * the same VLAN ID are both accepted with 201. This engine trusts the
 * validator to have already blocked that; it does not re-check here.
 */

import { fetchXcc, requestXcc } from '../validationEngine/xccClient.js';
import { verifyValidationToken } from './validationToken.js';
import { canonicalizeTopologyIntent } from '../validationEngine/topologyConfigValidator.js';
import { computePlanHash } from './validationToken.js';

function toArray(val) {
  return Array.isArray(val?.data) ? val.data : Array.isArray(val) ? val : [];
}

/** Pick an existing topology in the same mode as the closest available template. */
export function pickTopologyTemplate(topologies, mode) {
  const inMode = topologies.find((t) => t.mode === mode);
  return inMode ?? topologies[0] ?? null;
}

/** Mirror-then-deviate: clone a known-good topology, override only what the intent specifies. */
export function buildTopologyPayload(intent, template) {
  const base = template
    ? JSON.parse(JSON.stringify(template))
    : {
        // No existing topology to mirror — minimal viable scaffold matching
        // the shape measured on a live Gateway (features/mtu/proxied are the
        // fields that "shouldn't matter" but the platform's own UI always sends).
        mode: 'BridgedAtAp',
        mtu: 1500,
        proxied: 'Local',
        dhcpMode: 'DHCPNone',
        l3Presence: false,
        multicastBridging: false,
        features: ['CENTRALIZED-SITE'],
      };

  // These are server-computed/identity fields on read; sending them back
  // is harmless on some builds and rejected on others — strip unconditionally.
  delete base.id;
  delete base.canDelete;
  delete base.canEdit;
  delete base.custId;
  delete base.profiles;
  delete base.members;

  return {
    ...base,
    name: (intent.topologyName ?? `VLAN-${intent.vlanId}`).slice(0, 32),
    vlanid: intent.vlanId,
    tagged: intent.tagged ?? true,
    mode: intent.mode ?? base.mode ?? 'BridgedAtAp',
  };
}

/**
 * @param {object} params
 * @param {object} params.intent create_vlan intent: { vlanId, topologyName, mode, tagged }
 * @param {string} params.planHash
 * @param {string} params.validationToken
 * @param {string} params.authToken
 * @param {string} params.controllerUrl
 * @param {Function} [params.fetchFn]
 */
export async function provisionTopology({ intent, planHash, validationToken, authToken, controllerUrl, fetchFn }) {
  const opts = { authToken, controllerUrl, fetchFn };

  const verified = verifyValidationToken(validationToken);
  const recomputedHash = computePlanHash(canonicalizeTopologyIntent(intent));
  if (!verified || verified.planHash !== planHash || recomputedHash !== planHash) {
    return { status: 'failed', stage: 'authorization', reason: 'invalid_or_stale_validation_token' };
  }

  let topologies;
  try {
    topologies = toArray(await fetchXcc('/v1/topologies', opts));
  } catch (err) {
    return { status: 'failed', stage: 'inspect_existing_state', error: err.message };
  }

  // Re-check the conflict right before writing — the validation token can be
  // up to 30 minutes old, and topology creation isn't Gateway-enforced at all
  // (the gap this validator exists for), so a second topology could have
  // claimed the same vlanid in the interim.
  const dup = topologies.find((t) => t.vlanid === intent.vlanId);
  if (dup) {
    return {
      status: 'failed',
      stage: 'conflict_recheck',
      reason: `vlanid ${intent.vlanId} was claimed by '${dup.name}' (id=${dup.id}) after validation ran.`,
    };
  }

  const template = pickTopologyTemplate(topologies, intent.mode ?? 'BridgedAtAp');
  const payload = buildTopologyPayload(intent, template);

  const created = await requestXcc('/v1/topologies', { ...opts, method: 'POST', body: payload });
  if (!created.ok) {
    return { status: 'failed', stage: 'create_topology', httpStatus: created.status, error: created.errorText };
  }

  // The Gateway assigns its own id regardless of what (if anything) we sent —
  // read it out of the response, never assume it. A missing id here means the
  // create response shape changed and nothing downstream can be trusted.
  const serverAssignedId = created.data?.id;
  if (!serverAssignedId) {
    return { status: 'degraded', stage: 'create_topology', reason: 'Response carried no id', responseBody: created.data };
  }

  let readBack;
  try {
    readBack = await fetchXcc(`/v1/topologies/${encodeURIComponent(serverAssignedId)}`, opts);
  } catch (err) {
    return { status: 'degraded', stage: 'read_back', topologyId: serverAssignedId, error: err.message };
  }

  const vlanMismatch = readBack.vlanid !== payload.vlanid;
  const taggedMismatch = readBack.tagged !== payload.tagged;
  const nameMismatch = readBack.name !== payload.name;

  const status = vlanMismatch || taggedMismatch || nameMismatch ? 'degraded' : 'completed';

  return {
    status,
    topologyId: serverAssignedId,
    topologyName: readBack.name,
    readBack: {
      vlanid: readBack.vlanid,
      tagged: readBack.tagged,
      mode: readBack.mode,
      vlanMismatch,
      taggedMismatch,
      nameMismatch,
    },
    notes: [
      'Topology created. It has no traffic and no clients until a Service (WLAN) sets it as defaultTopology.',
      ...(vlanMismatch || taggedMismatch || nameMismatch
        ? ['One or more requested fields did not survive the write — see readBack above.']
        : []),
    ],
  };
}

/**
 * Strip a topology from use and remove it. There is no "unbind" step the way
 * a Service has profile bindings — a Topology only becomes unreachable when
 * every Service pointing at it is repointed or deleted, which this function
 * does not attempt (that is a WLAN-domain change, not a topology one). It
 * refuses to delete a topology any live service still references, rather than
 * silently deleting out from under a working WLAN.
 */
export async function rollbackTopology({ topologyId, authToken, controllerUrl, fetchFn, force = false }) {
  const opts = { authToken, controllerUrl, fetchFn };

  let services = [];
  try {
    services = toArray(await fetchXcc('/v1/services', opts));
  } catch (err) {
    return { status: 'failed', stage: 'inspect_services', error: err.message };
  }
  const dependents = services.filter((s) => s.defaultTopology === topologyId);
  if (dependents.length > 0 && !force) {
    return {
      status: 'blocked',
      reason: `${dependents.length} service(s) still reference this topology: ${dependents.map((s) => s.serviceName).join(', ')}.`,
      dependents: dependents.map((s) => ({ id: s.id, name: s.serviceName })),
    };
  }

  const result = await requestXcc(`/v1/topologies/${encodeURIComponent(topologyId)}`, { ...opts, method: 'DELETE' });
  if (!result.ok) {
    return { status: 'failed', stage: 'delete_topology', httpStatus: result.status, error: result.errorText };
  }
  return { status: 'completed', topologyId };
}
