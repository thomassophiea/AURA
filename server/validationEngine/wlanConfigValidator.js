/**
 * Full pre-provision validation for a create_wlan intent.
 *
 * Composes the existing per-concern validators (vlanValidator, dhcpValidator,
 * rfCapacityAnalyzer, confidenceAggregator) that already power
 * `POST /validate/intent`, and adds the checks that VLAN-only endpoint never
 * needed: site resolution/existence, AP scope, and WLAN name conflicts. Also
 * produces the stable plan hash + signed validation token that
 * `POST /validate/intent` never had (its `provisioningToken` is an unsigned
 * timestamp string with no server-side verification — see the migration
 * matrix). This module's token is verified by wlanProvisioningEngine before
 * any write.
 */

import { fetchXcc } from './xccClient.js';
import { validateVlanExists } from './vlanValidator.js';
import { validateDhcp } from './dhcpValidator.js';
import { analyzeRfCapacity } from './rfCapacityAnalyzer.js';
import { aggregateConfidence } from './confidenceAggregator.js';
import { computePlanHash, signValidationToken } from '../cortex/validationToken.js';

function toArray(val) {
  return Array.isArray(val?.data) ? val.data : Array.isArray(val) ? val : [];
}

function siteName(site) {
  return site.siteName ?? site.name ?? site.treeNode?.name;
}

// rfCapacityAnalyzer predates the typed WirelessConfigurationIntent security
// union and still expects its legacy string enum (`POST /validate/intent`'s
// caller passes that literal) — translate rather than compare the new mode
// directly, or the WPA2-on-6GHz check silently never fires.
const LEGACY_SECURITY_LABEL = {
  wpa2_personal: 'WPA2-PSK',
  wpa3_personal: 'WPA3-SAE',
};

/** Canonical, order-independent shape hashed into the plan token. */
export function canonicalizeIntent(intent) {
  return {
    action: intent.action,
    siteId: intent.siteId ?? null,
    wlanName: intent.wlanName ?? null,
    ssid: intent.ssid ?? intent.wlanName ?? null,
    vlanId: intent.vlanId ?? null,
    securityMode: intent.security?.mode ?? null,
    // The plaintext PSK is never hashed or stored — only whether one was
    // supplied, so a PSK edit is caught without persisting the secret.
    hasCredential: Boolean(intent.security?.credentialReference),
    accessPointIds: [...(intent.accessPointIds ?? [])].sort(),
  };
}

/**
 * @param {object} intent A create_wlan WirelessConfigurationIntent, with
 *   `siteName` resolved by the caller from operator text (this function does
 *   the live siteId lookup) and `_ephemeralPassword` if a PSK/SAE key was
 *   captured by the parser.
 * @param {{ authToken: string, controllerUrl: string, ephemeralPassword?: string }} opts
 * @returns {Promise<object>} WirelessValidationReport
 */
export async function validateWlanIntent(intent, opts) {
  const checks = [];
  const multipliers = {};
  let resolvedSite = null;
  let resolvedTopology = null;

  // --- Check: site_exists (never provision into a silently-inferred Global scope) ---
  if (!intent.siteId && !intent.siteName) {
    checks.push({
      name: 'site_exists',
      result: 'block',
      evidence: 'No Site was specified — AURA never infers Global scope silently.',
    });
  } else {
    try {
      const sites = toArray(await fetchXcc('/v3/sites', opts));
      resolvedSite = intent.siteId
        ? sites.find((s) => s.id === intent.siteId)
        : sites.find((s) => (siteName(s) ?? '').toLowerCase() === (intent.siteName ?? '').toLowerCase()) ??
          sites.find((s) => (siteName(s) ?? '').toLowerCase().includes((intent.siteName ?? '').toLowerCase()));

      if (!resolvedSite) {
        checks.push({
          name: 'site_exists',
          result: 'block',
          evidence: `No site matched "${intent.siteId ?? intent.siteName}" (${sites.length} sites checked).`,
        });
      } else {
        checks.push({
          name: 'site_exists',
          result: 'pass',
          evidence: `GET /v3/sites → id=${resolvedSite.id} name='${siteName(resolvedSite)}'`,
        });
      }
    } catch (err) {
      checks.push({ name: 'site_exists', result: 'block', evidence: `Controller unreachable: ${err.message}` });
    }
  }

  // --- Check: wlan_name_conflict ---
  if (intent.wlanName) {
    try {
      const services = toArray(await fetchXcc('/v1/services', opts));
      const dup = services.find(
        (s) => (s.serviceName ?? '').toLowerCase() === intent.wlanName.toLowerCase()
      );
      checks.push(
        dup
          ? {
              name: 'wlan_name_conflict',
              result: 'block',
              evidence: `GET /v1/services → a service named '${intent.wlanName}' already exists (id=${dup.id}).`,
            }
          : {
              name: 'wlan_name_conflict',
              result: 'pass',
              evidence: `GET /v1/services → no existing service named '${intent.wlanName}' (${services.length} checked).`,
            }
      );
    } catch (err) {
      checks.push({ name: 'wlan_name_conflict', result: 'warn', evidence: `Could not check existing services: ${err.message}` });
    }
  }

  // --- Check: vlan_exists + dhcp_scope (only if a VLAN was requested) ---
  if (intent.vlanId != null) {
    try {
      const topologies = toArray(await fetchXcc('/v1/topologies', opts));
      const vlanResult = validateVlanExists(topologies, intent.vlanId);
      checks.push({ name: 'vlan_exists', result: vlanResult.result, evidence: vlanResult.evidence });
      resolvedTopology = vlanResult.topology;
      if (resolvedTopology) {
        const dhcpResult = validateDhcp(resolvedTopology);
        checks.push({ name: 'dhcp_scope', result: dhcpResult.result, evidence: dhcpResult.evidence });
      }
    } catch (err) {
      checks.push({ name: 'vlan_exists', result: 'warn', evidence: `Controller unreachable: ${err.message}` });
    }
  }

  // --- Check: ap_scope (block provisioning into a site with zero APs) ---
  if (resolvedSite) {
    try {
      const aps = toArray(await fetchXcc('/v1/aps', opts));
      const siteAps = aps.filter((ap) => ap.siteId === resolvedSite.id || ap.siteName === siteName(resolvedSite));
      checks.push(
        siteAps.length > 0
          ? { name: 'ap_model_support', result: 'pass', evidence: `${siteAps.length} AP(s) found at '${siteName(resolvedSite)}'.` }
          : { name: 'ap_model_support', result: 'block', evidence: `No APs found at '${siteName(resolvedSite)}' — nothing to deploy to.` }
      );
    } catch (err) {
      checks.push({ name: 'ap_model_support', result: 'warn', evidence: `Could not enumerate APs: ${err.message}` });
    }
  }

  // --- Check: ssid_count_limit + band_compatibility ---
  try {
    const profiles = toArray(await fetchXcc('/v3/profiles', opts));
    const relevant = resolvedSite
      ? profiles.filter((p) => p.siteId === resolvedSite.id || !p.siteId) // profile scope varies by controller version
      : profiles;
    const legacyLabel = LEGACY_SECURITY_LABEL[intent.security?.mode] ?? intent.security?.mode;
    const { ssidResult, bandResult } = analyzeRfCapacity(relevant, legacyLabel);
    checks.push({ name: 'ssid_count_limit', result: ssidResult.result, evidence: ssidResult.evidence });
    checks.push({ name: 'band_compatibility', result: bandResult.result, evidence: bandResult.evidence });
  } catch (err) {
    checks.push({ name: 'ssid_count_limit', result: 'warn', evidence: `Could not check profile capacity: ${err.message}` });
  }

  // --- Aggregate confidence ---
  const confidence = aggregateConfidence(checks, multipliers);
  const blockingIssues = confidence.blockingFailures ?? [];
  const warnings = confidence.warnings ?? [];

  const recommendation =
    confidence.band === 'BLOCK' || blockingIssues.length > 0
      ? 'Provisioning blocked. Resolve the failed checks above before retrying.'
      : confidence.band === 'HIGH'
        ? 'Infrastructure validated. Ready for operator approval.'
        : confidence.band === 'MEDIUM'
          ? 'Can provision with approval. Review warnings before proceeding.'
          : 'Confidence is low. Review carefully before approving.';

  const canonical = canonicalizeIntent({ ...intent, security: intent.security });
  const planHash = computePlanHash(canonical);

  let validationToken = null;
  let expiresAt = null;
  if (confidence.band !== 'BLOCK' && blockingIssues.length === 0) {
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
      blockingIssues,
      warnings,
    },
    recommendation,
    preProvisionSnapshot: {
      site: resolvedSite ? { id: resolvedSite.id, name: siteName(resolvedSite) } : null,
      topology: resolvedTopology ? { id: resolvedTopology.id, name: resolvedTopology.name, vlanid: resolvedTopology.vlanid } : null,
    },
    planHash,
    validationToken,
    expiresAt,
  };
}
