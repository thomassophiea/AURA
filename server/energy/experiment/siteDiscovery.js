/**
 * Discover the treatment/control site pair and its AP membership from the live
 * controller.
 *
 * ANY site may be paired against ANY other site. Nothing here is hardcoded to a
 * site id or to a naming convention: ids change when a site is rebuilt, and the
 * lab pair (EAL-PT-N / EAL-PT-S) is one configuration among many. The rule is:
 * an explicit configured pair wins; failing that, a name heuristic proposes
 * one; failing that, the caller is told to pick.
 *
 * Verified controller endpoints (XCC 10.20.1.0-020R):
 *   GET /v3/sites       → [{ id, siteName, timezone, deviceGroups:[{apSerialNumbers}] }]
 *   GET /v1/aps/query   → [{ serialNumber, hardwareType, platformName, hostSite,
 *                            status, apName, pwrUsage, radios[] }]
 *
 * `hostSite` is a site NAME, not an id. Membership is therefore resolved by
 * joining on name, and the name is carried forward so the safety boundary can
 * re-check it without another lookup.
 */

/**
 * Naming conventions that PROPOSE a pair when none is configured.
 *
 * This is a convenience for the common lab layout (a `-N` / `-S` tower pair,
 * or sites literally named north/south), never a rule. Any site can be the
 * treatment and any other site the control — the configured pair always wins,
 * and an ambiguous or absent match proposes nothing rather than guessing.
 */
const TREATMENT_NAME_PATTERNS = [/(^|[^a-z])north([^a-z]|$)/i, /-n$/i, /_n$/i];
const CONTROL_NAME_PATTERNS = [/(^|[^a-z])south([^a-z]|$)/i, /-s$/i, /_s$/i];

function matchesAny(name, patterns) {
  return typeof name === 'string' && patterns.some((p) => p.test(name.trim()));
}

/** Rows out of a controller list response, tolerating the several shapes XCC returns. */
export function rows(payload, keys = []) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}

/** Normalize a controller site into just what the experiment needs. */
export function normalizeSite(site) {
  const serials = [];
  for (const group of site?.deviceGroups ?? []) {
    for (const serial of group?.apSerialNumbers ?? []) serials.push(serial);
  }
  return {
    siteId: site?.id ?? site?.siteId ?? null,
    siteName: site?.siteName ?? site?.name ?? null,
    timezone: site?.timezone ?? null,
    // Membership per the SITE record. Cross-checked against the AP inventory,
    // which is the authority when the two disagree.
    declaredSerials: serials,
  };
}

/** Normalize a controller AP into the fields the experiment reads. */
export function normalizeAp(ap) {
  return {
    serial: ap?.serialNumber ?? ap?.serial ?? null,
    apName: ap?.apName ?? ap?.hostname ?? null,
    model: ap?.platformName ?? ap?.hardwareType ?? null,
    hardwareType: ap?.hardwareType ?? null,
    siteName: ap?.hostSite || null,
    status: ap?.status ?? null,
    // Measured instantaneous draw in watts, straight from the AP's PoE
    // negotiation. This is the only power figure in the system that is measured
    // rather than modelled.
    //
    // The null/'' guard is not redundant: Number(null) and Number('') are both
    // 0, and Number.isFinite(0) is true, so a missing reading would otherwise
    // become a fabricated 0 W sample and integrate as real consumed-nothing
    // time. A missing reading must stay missing.
    watts: ap?.pwrUsage == null || ap.pwrUsage === ''
      ? null
      : Number.isFinite(Number(ap.pwrUsage))
        ? Number(ap.pwrUsage)
        : null,
    powerSource: ap?.pwrSource ?? null,
    clientCount: (ap?.radios ?? []).reduce((sum, r) => sum + (Number(r?.clients) || 0), 0),
    radios: (ap?.radios ?? []).map((r) => ({
      radioIndex: r?.radioIndex ?? null,
      mode: r?.mode ?? null,
      band: bandForRadio(r),
      txPower: Number.isFinite(Number(r?.txPower)) ? Number(r.txPower) : null,
      clients: Number(r?.clients) || 0,
      channelOccupancy: Number.isFinite(Number(r?.channelOccupancy))
        ? Number(r.channelOccupancy)
        : null,
    })),
  };
}

/**
 * Band from the radio's operating frequency, falling back to its 802.11 mode.
 * The controller does not label bands directly on the AP query response.
 */
export function bandForRadio(radio) {
  const freq = Number(radio?.channelFreq);
  if (Number.isFinite(freq) && freq > 0) {
    if (freq < 3000) return '2.4';
    if (freq < 5925) return '5';
    return '6';
  }
  const mode = String(radio?.mode ?? '');
  if (mode.includes('g')) return '2.4';
  if (mode.includes('ax6') || mode.includes('6e')) return '6';
  if (mode.includes('a')) return '5';
  return null;
}

/**
 * Propose a treatment/control pair from site names.
 * Returns `null` for a side with no unambiguous match rather than guessing —
 * a wrong pair points the treatment at the wrong hardware.
 */
export function proposePair(sites) {
  const treatmentMatches = sites.filter((s) => matchesAny(s.siteName, TREATMENT_NAME_PATTERNS));
  const controlMatches = sites.filter((s) => matchesAny(s.siteName, CONTROL_NAME_PATTERNS));
  return {
    treatment: treatmentMatches.length === 1 ? treatmentMatches[0] : null,
    control: controlMatches.length === 1 ? controlMatches[0] : null,
    treatmentCandidates: treatmentMatches,
    controlCandidates: controlMatches,
  };
}

/**
 * Full discovery pass.
 *
 * @param {{ session: { get: Function }, configuredPair?: {treatmentSiteId?:string, controlSiteId?:string} }} args
 * @returns {Promise<{ ok: boolean, error?: string, sites: object[], aps: object[],
 *                     pair: {treatment: object|null, control: object|null, proposed: boolean},
 *                     membership: {treatment: object[], control: object[]},
 *                     anomalies: string[] }>}
 */
export async function discover({ session, configuredPair = {} }) {
  const [siteResp, apResp] = await Promise.all([
    session.get('/v3/sites'),
    session.get('/v1/aps/query'),
  ]);

  if (!siteResp.ok) {
    return { ok: false, error: siteResp.errorSummary ?? 'Site list unavailable.', sites: [], aps: [] };
  }
  if (!apResp.ok) {
    return { ok: false, error: apResp.errorSummary ?? 'AP inventory unavailable.', sites: [], aps: [] };
  }

  const sites = rows(siteResp.data, ['sites']).map(normalizeSite).filter((s) => s.siteId);
  const aps = rows(apResp.data, ['aps', 'accessPoints']).map(normalizeAp).filter((a) => a.serial);

  const treatmentConfigured = Boolean(configuredPair.treatmentSiteId);
  const controlConfigured = Boolean(configuredPair.controlSiteId);
  let treatment = treatmentConfigured
    ? sites.find((s) => s.siteId === configuredPair.treatmentSiteId) ?? null
    : null;
  let control = controlConfigured
    ? sites.find((s) => s.siteId === configuredPair.controlSiteId) ?? null
    : null;
  let proposed = false;

  // The name heuristic only fills a side that was never configured. A CONFIGURED
  // site that no longer resolves must stay unresolved: falling back would
  // silently re-point the treatment at a different site, which is the worst
  // outcome this module can produce.
  const suggestion = proposePair(sites);
  if (!treatment && !treatmentConfigured) {
    treatment = suggestion.treatment;
    proposed = true;
  }
  if (!control && !controlConfigured) {
    control = suggestion.control;
    proposed = true;
  }

  const membershipFor = (site) =>
    site ? aps.filter((a) => a.siteName && a.siteName === site.siteName) : [];

  const membership = { treatment: membershipFor(treatment), control: membershipFor(control) };
  const anomalies = [];

  // A configured site id that no longer resolves is the single most dangerous
  // discovery outcome: it silently produces an empty treatment group.
  if (configuredPair.treatmentSiteId && !treatment) {
    anomalies.push(`Configured Treatment site ${configuredPair.treatmentSiteId} no longer exists on this controller.`);
  }
  if (configuredPair.controlSiteId && !control) {
    anomalies.push(`Configured Control site ${configuredPair.controlSiteId} no longer exists on this controller.`);
  }

  for (const [side, site] of [['Treatment', treatment], ['Control', control]]) {
    if (!site) continue;
    const members = membershipFor(site);
    if (members.length === 0) {
      anomalies.push(`${side} site '${site.siteName}' has no access points assigned.`);
    }
    // Declared-vs-observed disagreement means the site record and the AP
    // inventory are out of step; the AP inventory wins, but say so.
    const declared = new Set(site.declaredSerials);
    const observed = new Set(members.map((m) => m.serial));
    for (const serial of declared) {
      if (!observed.has(serial)) {
        anomalies.push(
          `${side}: ${serial} is listed in site '${site.siteName}' but does not report that site in the AP inventory.`
        );
      }
    }
    const models = new Set(members.map((m) => m.model));
    if (models.size > 1) {
      anomalies.push(`${side} mixes AP models (${[...models].join(', ')}); per-AP normalization is required.`);
    }
    for (const m of members) {
      if (m.status && m.status !== 'InService') {
        anomalies.push(`${side}: ${m.serial} is '${m.status}' and will not contribute telemetry.`);
      }
    }
  }

  if (treatment && control) {
    const diff = Math.abs(membership.treatment.length - membership.control.length);
    if (diff > 0) {
      anomalies.push(
        `Treatment has ${membership.treatment.length} AP(s) and Control has ${membership.control.length}; ` +
          'comparisons must be normalized per AP.'
      );
    }
  }

  return { ok: true, sites, aps, pair: { treatment, control, proposed }, membership, anomalies };
}
