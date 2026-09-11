/**
 * Full pre-provision validation for a create_vlan (Topology) intent.
 *
 * Mirrors wlanConfigValidator.js's shape (checks[] -> aggregateConfidence ->
 * plan hash + signed token) but with a different dependency graph: a Topology
 * has no Site/AP scope of its own — it becomes reachable only once a WLAN
 * binds to it. The one check this domain needs that WLAN validation never
 * did is enforcing VLAN-ID uniqueness ourselves.
 *
 * **Measured against the lab Gateway (10.20.01.0024) 2026-09-11: the Gateway
 * does NOT reject a duplicate `vlanid` on POST /v1/topologies.** Two
 * topologies with `vlanid: 1` were both accepted with 201, one with a
 * `canDelete`/`canEdit` cost only visible after the fact. This is a genuine
 * platform gap the ai-first-configuration `create-vlan.md` scenario had
 * documented as a 422 — that was wrong; corrected there. AURA supplies the
 * safety net the API does not: `vlan_conflict` blocks here, client-side,
 * before the write.
 */

import { fetchXcc } from './xccClient.js';
import { computePlanHash, signValidationToken } from '../cortex/validationToken.js';

function toArray(val) {
  return Array.isArray(val?.data) ? val.data : Array.isArray(val) ? val : [];
}

/** Canonical, order-independent shape hashed into the plan token. */
export function canonicalizeTopologyIntent(intent) {
  return {
    action: 'create_vlan',
    vlanId: intent.vlanId ?? null,
    topologyName: intent.topologyName ?? null,
    mode: intent.mode ?? 'BridgedAtAp',
    tagged: intent.tagged ?? true,
  };
}

/**
 * @param {object} intent create_vlan intent: { vlanId, topologyName, mode, tagged }
 * @param {{ authToken: string, controllerUrl: string, fetchFn?: Function }} opts
 * @returns {Promise<object>} validation report, same shape as WirelessValidationReport
 */
export async function validateTopologyIntent(intent, opts) {
  const checks = [];
  let existingTopologies = [];

  // --- Check: vlan_id_range (defense in depth — the parser already bounds this) ---
  if (!Number.isInteger(intent.vlanId) || intent.vlanId < 1 || intent.vlanId > 4094) {
    checks.push({
      name: 'vlan_id_range',
      result: 'block',
      evidence: `vlanId ${intent.vlanId} is outside the valid range 1-4094.`,
    });
  } else {
    checks.push({ name: 'vlan_id_range', result: 'pass', evidence: `vlanId ${intent.vlanId} is in range.` });
  }

  // --- Check: vlan_conflict (the Gateway will NOT stop this itself — measured) ---
  try {
    existingTopologies = toArray(await fetchXcc('/v1/topologies', opts));
    const dupVlan = existingTopologies.find((t) => t.vlanid === intent.vlanId);
    const dupName = intent.topologyName
      ? existingTopologies.find((t) => (t.name ?? '').toLowerCase() === intent.topologyName.toLowerCase())
      : null;
    if (dupVlan) {
      checks.push({
        name: 'vlan_conflict',
        result: 'block',
        evidence: `GET /v1/topologies → vlanid=${intent.vlanId} already in use by '${dupVlan.name}' (id=${dupVlan.id}). The Gateway API itself does not reject this — AURA blocks it.`,
      });
    } else if (dupName) {
      checks.push({
        name: 'vlan_conflict',
        result: 'block',
        evidence: `GET /v1/topologies → a topology named '${intent.topologyName}' already exists (id=${dupName.id}, vlanid=${dupName.vlanid}).`,
      });
    } else {
      checks.push({
        name: 'vlan_conflict',
        result: 'pass',
        evidence: `GET /v1/topologies → no existing topology uses vlanid=${intent.vlanId} or the name '${intent.topologyName ?? '(auto)'}' (${existingTopologies.length} checked).`,
      });
    }
  } catch (err) {
    checks.push({ name: 'vlan_conflict', result: 'block', evidence: `Controller unreachable: ${err.message}` });
  }

  const confidence = { score: 0, band: 'LOW', blockingFailures: [], warnings: [] };
  const hardBlocks = checks.filter((c) => c.result === 'block');
  if (hardBlocks.length > 0) {
    confidence.band = 'BLOCK';
    confidence.blockingFailures = hardBlocks.map((c) => c.name);
  } else {
    confidence.score = 90;
    confidence.band = 'HIGH';
  }

  const recommendation =
    confidence.band === 'BLOCK'
      ? 'Provisioning blocked. Resolve the failed checks above before retrying.'
      : 'Infrastructure validated. Ready for operator approval.';

  const canonical = canonicalizeTopologyIntent(intent);
  const planHash = computePlanHash(canonical);

  let validationToken = null;
  let expiresAt = null;
  if (confidence.band !== 'BLOCK') {
    const signed = signValidationToken(planHash);
    validationToken = signed.token;
    expiresAt = signed.expiresAt;
  }

  return {
    intent,
    checks,
    confidence: {
      score: confidence.score,
      band: confidence.band === 'BLOCK' ? 'LOW' : confidence.band,
      blockingIssues: confidence.blockingFailures,
      warnings: confidence.warnings,
    },
    recommendation,
    planHash,
    validationToken,
    expiresAt,
  };
}
