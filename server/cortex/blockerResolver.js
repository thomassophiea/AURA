/**
 * The blocker resolution ladder.
 *
 * A BLOCKER IS NOT A DEAD END
 * ---------------------------
 * "Create a guest network" arrives missing a site, a name and a security mode.
 * Before this module, each of those ended the task. The rule here is that a
 * blocker is unresolved state, and unresolved state gets worked on a ladder:
 *
 *   1. existing workflow context      — did the operator already say it?
 *   2. an authoritative source        — can the Gateway or Postgres answer it?
 *   3. a safe default                 — low risk only, and ALWAYS disclosed
 *   4. ask the human                  — real decisions only
 *   5. an alternate path              — offer a different way through
 *
 * Only after 1-3 fail does a human get asked, and only what is genuinely theirs
 * to decide. That is the difference between an assistant and a web form.
 *
 * WHAT IS DELIBERATELY NEVER DEFAULTED
 * ------------------------------------
 * Security mode. A guest network that silently defaults to Open because nobody
 * answered is a security incident with a friendly tone of voice. Some questions
 * are the operator's to answer and the ladder must not "helpfully" skip them,
 * so `security.mode` is pinned to rung 4 regardless of what else is known.
 *
 * ZERO IS NOT THE SAME AS COULD-NOT-READ
 * --------------------------------------
 * Every authoritative lookup distinguishes "the Gateway answered, and the answer
 * was none" from "the read failed". The first can resolve a blocker; the second
 * must never be allowed to look like an answer. This is the same rule the
 * diagnostic tools apply to an empty site filter, applied to configuration.
 *
 * Sources are injected rather than imported so the ladder is testable without a
 * Gateway, and so a failing source is a value this module reasons about rather
 * than an exception that escapes it.
 */

import { BLOCKER_TYPE } from './workflowStore.js';

/** Fields whose answer is always the operator's, never the system's. */
const HUMAN_ONLY_FIELDS = new Set(['security.mode', 'security.credentialReference']);

/**
 * How each missing field is explained, and how it may be settled.
 *
 * `reason` is written for the operator, not the log: "Specify VLAN" tells
 * somebody nothing, and they will answer it wrong or not at all.
 */
const FIELD_SPEC = {
  siteId: {
    type: BLOCKER_TYPE.MISSING_REQUIRED_FIELD,
    reason: 'Which site should this network be deployed to?',
    risk: 'medium',
  },
  wlanName: {
    type: BLOCKER_TYPE.MISSING_REQUIRED_FIELD,
    reason: 'What should the network be called?',
    risk: 'low',
  },
  'security.mode': {
    type: BLOCKER_TYPE.MISSING_REQUIRED_FIELD,
    reason: 'How should clients connect to this network?',
    risk: 'high',
  },
  'security.credentialReference': {
    type: BLOCKER_TYPE.MISSING_REQUIRED_FIELD,
    reason: 'What passphrase should this network use?',
    risk: 'high',
  },
  vlanId: {
    type: BLOCKER_TYPE.MISSING_DEPENDENCY,
    reason: 'Which network (VLAN) should these clients be placed on?',
    risk: 'medium',
  },
  apScope: {
    type: BLOCKER_TYPE.AMBIGUOUS_SCOPE,
    reason: 'Which access points should broadcast this network?',
    risk: 'medium',
  },
};

/** A field nobody has described yet still gets a usable question. */
function specFor(field) {
  return (
    FIELD_SPEC[field] ?? {
      type: BLOCKER_TYPE.MISSING_REQUIRED_FIELD,
      reason: `What value should be used for ${field}?`,
      risk: 'medium',
    }
  );
}

/**
 * Turn the parser's `missingFields` into structured blockers.
 *
 * The parser already knows what it could not fill; this gives each one an
 * explanation, a risk and a route to resolution.
 */
export function blockersFromMissingFields(missingFields = []) {
  return missingFields.map((field) => {
    const spec = specFor(field);
    return {
      type: spec.type,
      reason: spec.reason,
      requiredInformation: field,
      risk: spec.risk,
      // Human-only fields never claim to be system-resolvable, so the ladder
      // cannot be tempted into answering them.
      resolvableBySystem: !HUMAN_ONLY_FIELDS.has(field),
      requiresHuman: HUMAN_ONLY_FIELDS.has(field),
      candidateValues: [],
      evidence: [],
    };
  });
}

/**
 * Turn a validator `block` result into a blocker rather than a dead end.
 *
 * `wlanConfigValidator` already produces precise, well-evidenced failures; what
 * it lacked was anywhere for them to go. A blocked check becomes an answerable
 * question wherever the shape of the failure allows one.
 */
export function blockerFromValidationFailure(check) {
  const byCheck = {
    site_exists: {
      type: BLOCKER_TYPE.AMBIGUOUS_ENTITY,
      requiredInformation: 'siteId',
      reason: 'That site could not be found on this Gateway. Which site did you mean?',
      resolvableBySystem: true,
    },
    wlan_name_conflict: {
      type: BLOCKER_TYPE.CONFIG_CONFLICT,
      requiredInformation: 'wlanName',
      reason: 'A network with that name already exists. What should this one be called?',
      resolvableBySystem: false,
    },
    ap_model_support: {
      type: BLOCKER_TYPE.AMBIGUOUS_SCOPE,
      requiredInformation: 'apScope',
      reason: 'No access points at that site are available to carry this network.',
      resolvableBySystem: true,
    },
    vlan_exists: {
      type: BLOCKER_TYPE.MISSING_DEPENDENCY,
      requiredInformation: 'vlanId',
      reason: 'That VLAN does not exist at this site. Which network should clients use?',
      resolvableBySystem: true,
    },
  };

  const mapped = byCheck[check?.id] ?? {
    type: BLOCKER_TYPE.VALIDATION_FAILED,
    requiredInformation: null,
    reason: check?.message ?? 'A validation check failed.',
    resolvableBySystem: false,
  };

  return {
    ...mapped,
    risk: 'high',
    requiresHuman: !mapped.resolvableBySystem,
    candidateValues: [],
    evidence: check?.message ? [{ source: `validator:${check.id}`, detail: check.message }] : [],
  };
}

/**
 * Rung 1 — does the workflow already hold the answer?
 *
 * Covers the case the operator experiences as "I already told you that": a value
 * supplied in an earlier turn, or inherited from the page they opened Cortex on.
 */
function fromContext(field, { requestedState = {}, derivedState = {}, pageContext = {} }) {
  const merged = { ...derivedState, ...requestedState };
  if (merged[field] !== undefined && merged[field] !== null) {
    return { value: merged[field], by: 'system', note: 'already established in this task' };
  }
  if (field === 'siteId' && pageContext.siteName) {
    return {
      value: pageContext.siteName,
      by: 'system',
      note: `inherited from the ${pageContext.pageName ?? 'current'} page`,
    };
  }
  return null;
}

/**
 * Rung 2 — ask an authoritative source.
 *
 * Each branch returns either a resolution, or candidates for a human, or null.
 * A failed read returns candidates-less and stays open: an unreachable Gateway
 * must never read as "there is nothing there".
 */
async function fromAuthoritativeSource(field, ctx) {
  const { sources = {}, requestedState = {}, derivedState = {} } = ctx;
  const siteName = requestedState.siteName ?? derivedState.siteName ?? requestedState.siteId;

  if (field === 'siteId' && typeof sources.listSites === 'function') {
    const result = await safely(() => sources.listSites());
    if (!result.ok) return { failed: result.error };
    const sites = result.value ?? [];
    if (sites.length === 1) {
      return {
        value: sites[0].siteName ?? sites[0].name,
        by: 'system',
        note: 'the only site on this Gateway',
      };
    }
    if (sites.length > 1) {
      return { candidates: sites.map((s) => s.siteName ?? s.name).filter(Boolean) };
    }
    // Zero sites is a real answer, and it is not one a human can fix by typing.
    return { technical: 'This Gateway reports no sites, so there is nowhere to deploy a network.' };
  }

  if (field === 'apScope' && typeof sources.listAps === 'function') {
    const result = await safely(() => sources.listAps(siteName));
    if (!result.ok) return { failed: result.error };
    const aps = result.value ?? [];
    if (aps.length) {
      return {
        value: aps.map((ap) => ap.serialNumber ?? ap.serial).filter(Boolean),
        by: 'system',
        note: `${aps.length} access point${aps.length === 1 ? '' : 's'} at ${siteName}`,
      };
    }
    return {
      technical: `No access points report ${siteName} as their site, so a network deployed there would not broadcast.`,
    };
  }

  if (field === 'vlanId' && typeof sources.listTopologies === 'function') {
    const result = await safely(() => sources.listTopologies(siteName));
    if (!result.ok) return { failed: result.error };
    const topologies = result.value ?? [];
    const guessGuest = topologies.filter((t) => /guest/i.test(t.name ?? ''));
    if (guessGuest.length === 1) {
      return {
        value: guessGuest[0].vlanid ?? guessGuest[0].vlanId,
        by: 'system',
        note: `${guessGuest[0].name} is already used for guest traffic here`,
      };
    }
    if (topologies.length) {
      return {
        candidates: topologies
          .map((t) => (t.vlanid ?? t.vlanId) && `${t.name} (VLAN ${t.vlanid ?? t.vlanId})`)
          .filter(Boolean),
      };
    }
    return null;
  }

  return null;
}

/**
 * Rung 3 — a safe default.
 *
 * Only where being wrong is cheap and visible. A name is; a security mode is
 * not. Anything settled here is stamped `by: 'default'` so the preview can say
 * out loud that Cortex chose it rather than the operator.
 */
function safeDefault(field, { workflowType, userIntent = '' }) {
  if (field === 'wlanName' && workflowType === 'create_wlan') {
    if (/\bguest\b/i.test(userIntent)) {
      return { value: 'Guest', by: 'default', note: 'inferred from "guest network"' };
    }
  }
  return null;
}

/** Run a source without letting it throw into the ladder. */
async function safely(fn) {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

/**
 * Walk the ladder for one blocker.
 *
 * Returns the blocker annotated with either a resolution, candidate values for
 * a human, or a technical dead end. Never throws: a source that fails leaves the
 * blocker open and says why.
 */
export async function resolveBlockerAutomatically(blocker, ctx = {}) {
  const field = blocker.requiredInformation;

  if (!field || HUMAN_ONLY_FIELDS.has(field)) {
    return { ...blocker, resolution: null, requiresHuman: true };
  }

  const contextual = fromContext(field, ctx);
  if (contextual) return { ...blocker, resolution: contextual, status: 'RESOLVED' };

  const authoritative = await fromAuthoritativeSource(field, ctx);

  if (authoritative?.value !== undefined && authoritative.value !== null) {
    return { ...blocker, resolution: authoritative, status: 'RESOLVED' };
  }

  if (authoritative?.candidates?.length) {
    return {
      ...blocker,
      candidateValues: authoritative.candidates,
      requiresHuman: true,
      evidence: [
        ...(blocker.evidence ?? []),
        { source: 'gateway', detail: `${authoritative.candidates.length} options found` },
      ],
    };
  }

  if (authoritative?.technical) {
    // Rung 5 exhausted: no human answer would help. This is a legitimate
    // outcome, and saying so beats asking a question with no good answer.
    return {
      ...blocker,
      type: BLOCKER_TYPE.UNKNOWN_NETWORK_STATE,
      reason: authoritative.technical,
      requiresHuman: false,
      resolvableBySystem: false,
      technicalDeadEnd: true,
    };
  }

  if (authoritative?.failed) {
    return {
      ...blocker,
      type: BLOCKER_TYPE.API_UNAVAILABLE,
      reason: `${blocker.reason} (this could not be looked up automatically: ${authoritative.failed})`,
      requiresHuman: true,
      evidence: [...(blocker.evidence ?? []), { source: 'gateway', detail: authoritative.failed }],
    };
  }

  const fallback = safeDefault(field, ctx);
  if (fallback) return { ...blocker, resolution: fallback, status: 'RESOLVED' };

  return { ...blocker, requiresHuman: true };
}

/**
 * Walk the ladder for every blocker, in parallel.
 *
 * Independent lookups should not queue behind each other: resolving a site and
 * listing APs are unrelated reads, and an operator waiting on a question does
 * not care which order they happened in.
 */
export async function resolveAll(blockers, ctx = {}) {
  const walked = await Promise.all(blockers.map((b) => resolveBlockerAutomatically(b, ctx)));

  return {
    resolved: walked.filter((b) => b.status === 'RESOLVED'),
    needHuman: walked.filter((b) => b.status !== 'RESOLVED' && !b.technicalDeadEnd),
    deadEnds: walked.filter((b) => b.technicalDeadEnd),
  };
}

export const __testing = { fromContext, safeDefault, HUMAN_ONLY_FIELDS };
