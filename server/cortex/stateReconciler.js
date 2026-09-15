/**
 * Expected state -> Configured state -> Observed state.
 *
 * WHY THREE STATES AND NOT TWO
 * ----------------------------
 * Assurance products compare what they measure against a threshold.
 * Configuration products compare what you asked for against what the API
 * accepted. Neither catches this platform's dominant failure mode, which is
 * documented in the write doctrine and was measured, not assumed:
 *
 *   "This Gateway accepts a write, returns success, and silently discards parts
 *    of the payload whose shape it did not like. The SSID simply never appears."
 *
 * A two-state product reports that configuration as correct, because the
 * configuration IS correct — it is just not the configuration the radios are
 * running. Only a three-way comparison separates the three things an operator
 * needs to tell apart:
 *
 *   expected != configured   someone changed it, or it was never written
 *   configured != observed   it was written, accepted, and silently dropped
 *   expected == configured == observed but users still suffer
 *                            the configuration is not the problem — stop
 *                            rewriting it and go look somewhere else
 *
 * That last row is worth as much as the other two. Proving a WLAN is correctly
 * configured AND correctly running is what licenses an investigation to move on.
 *
 * WHERE "EXPECTED" COMES FROM
 * ---------------------------
 * Never from the model. Three legitimate sources, in descending strength:
 *   1. an explicit operator intent ("this WLAN should be on VLAN 30");
 *   2. a WORKING PEER — the same WLAN at a site where users are fine, which is
 *      the most useful and most under-used reference this platform has;
 *   3. a previously captured baseline of the same object.
 * With none of those, expected is UNKNOWN and every row says so rather than
 * quietly falling back to "whatever is configured", which would make the whole
 * comparison self-confirming.
 */

/** Per-attribute verdicts. Ordered by how much they should alarm an operator. */
export const RECONCILE = {
  ALIGNED: 'aligned',
  CONFIG_DRIFT: 'config_drift',
  NOT_APPLIED: 'not_applied',
  UNEXPECTED_STATE: 'unexpected_state',
  UNKNOWN: 'unknown',
};

const SEVERITY = {
  [RECONCILE.NOT_APPLIED]: 4,
  [RECONCILE.CONFIG_DRIFT]: 3,
  [RECONCILE.UNEXPECTED_STATE]: 2,
  [RECONCILE.UNKNOWN]: 1,
  [RECONCILE.ALIGNED]: 0,
};

/** A value that is genuinely absent, as opposed to false or zero. */
const isAbsent = (v) => v === undefined || v === null || v === '';

/**
 * Default comparison: loose on presentation, strict on meaning.
 *
 * VLAN 30 and "30" are the same VLAN typed by two different layers; `true` and
 * `"true"` are the same switch. Neither difference may be reported as drift, or
 * every comparison produces noise and the real drift is lost in it.
 */
export function defaultEquals(a, b) {
  if (isAbsent(a) && isAbsent(b)) return true;
  if (isAbsent(a) || isAbsent(b)) return false;
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return toBool(a) === toBool(b);
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    const as = [...(Array.isArray(a) ? a : [a])].map(String).sort();
    const bs = [...(Array.isArray(b) ? b : [b])].map(String).sort();
    return as.length === bs.length && as.every((v, i) => v === bs[i]);
  }
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function toBool(v) {
  if (typeof v === 'boolean') return v;
  return /^(true|1|yes|enabled|on)$/i.test(String(v).trim());
}

/**
 * Reconcile one attribute across the three states.
 *
 * @param {object} args
 * @param {*} args.expected
 * @param {*} args.configured
 * @param {*} args.observed
 * @param {Function} [args.equals]
 * @param {boolean} [args.observable]  false when this attribute has no
 *   operational reading at all — which is a capability gap, not a match
 */
export function reconcileAttribute({
  attribute,
  expected,
  configured,
  observed,
  equals = defaultEquals,
  observable = true,
  note = null,
}) {
  const haveExpected = !isAbsent(expected);
  const haveConfigured = !isAbsent(configured);
  const haveObserved = observable && !isAbsent(observed);

  const base = { attribute, expected, configured, observed, note };

  // No operational reading. Saying "aligned" here would claim the radios agree
  // when nothing was asked. This is the row that becomes an API gap entry.
  if (!observable || !haveObserved) {
    if (haveExpected && haveConfigured && !equals(expected, configured)) {
      return {
        ...base,
        verdict: RECONCILE.CONFIG_DRIFT,
        detail: `Configured as ${fmt(configured)} but expected ${fmt(expected)}. Operational state is not readable, so it is unknown whether the running state matches either.`,
      };
    }
    return {
      ...base,
      verdict: RECONCILE.UNKNOWN,
      detail: observable
        ? 'No operational reading was obtained for this attribute.'
        : 'This platform exposes no operational reading for this attribute, so a write to it cannot be verified.',
    };
  }

  if (haveExpected && haveConfigured && !equals(expected, configured)) {
    return {
      ...base,
      verdict: RECONCILE.CONFIG_DRIFT,
      detail: `Expected ${fmt(expected)}; the Gateway is configured with ${fmt(configured)}.`,
    };
  }

  if (haveConfigured && !equals(configured, observed)) {
    return {
      ...base,
      verdict: RECONCILE.NOT_APPLIED,
      detail:
        `Configured as ${fmt(configured)} but running as ${fmt(observed)}. ` +
        'A write can be accepted and silently discarded on this platform, so treat the configuration as NOT applied until this agrees.',
    };
  }

  if (haveExpected && !equals(expected, observed)) {
    return {
      ...base,
      verdict: RECONCILE.UNEXPECTED_STATE,
      detail: `Running as ${fmt(observed)}, which matches the configuration but not the expectation of ${fmt(expected)}.`,
    };
  }

  return {
    ...base,
    verdict: RECONCILE.ALIGNED,
    detail: haveExpected
      ? `Expected, configured and running as ${fmt(observed)}.`
      : `Configured and running as ${fmt(observed)}.`,
  };
}

function fmt(v) {
  if (Array.isArray(v)) return v.length ? v.join(', ') : '(none)';
  if (typeof v === 'boolean') return v ? 'enabled' : 'disabled';
  return String(v);
}

/**
 * Reconcile a whole object.
 *
 * @param {object} args
 * @param {string} args.subject         what is being reconciled, e.g. a WLAN name
 * @param {object} args.expected        attribute -> value (may be {})
 * @param {object} args.configured
 * @param {object} args.observed
 * @param {object} [args.spec]          attribute -> {equals, observable, note}
 * @param {string} [args.expectedSource] where the expectation came from
 */
export function reconcileState({
  subject,
  expected = {},
  configured = {},
  observed = {},
  spec = {},
  expectedSource = null,
} = {}) {
  const attributes = [
    ...new Set([...Object.keys(expected), ...Object.keys(configured), ...Object.keys(observed), ...Object.keys(spec)]),
  ];

  const rows = attributes.map((attribute) =>
    reconcileAttribute({
      attribute,
      expected: expected[attribute],
      configured: configured[attribute],
      observed: observed[attribute],
      equals: spec[attribute]?.equals ?? defaultEquals,
      observable: spec[attribute]?.observable !== false,
      note: spec[attribute]?.note ?? null,
    })
  );

  rows.sort((a, b) => SEVERITY[b.verdict] - SEVERITY[a.verdict]);

  const counts = rows.reduce((acc, r) => {
    acc[r.verdict] = (acc[r.verdict] ?? 0) + 1;
    return acc;
  }, {});

  const notApplied = rows.filter((r) => r.verdict === RECONCILE.NOT_APPLIED);
  const drift = rows.filter((r) => r.verdict === RECONCILE.CONFIG_DRIFT);
  const unknown = rows.filter((r) => r.verdict === RECONCILE.UNKNOWN);

  let verdict;
  let summary;
  if (notApplied.length) {
    verdict = RECONCILE.NOT_APPLIED;
    summary =
      `${notApplied.length} attribute(s) of ${subject} are configured one way and running another ` +
      `(${notApplied.map((r) => r.attribute).join(', ')}). On this Gateway that is the signature of a ` +
      'write that was accepted and silently dropped — the configuration is not in effect.';
  } else if (drift.length) {
    verdict = RECONCILE.CONFIG_DRIFT;
    summary =
      `${subject} is running exactly as configured, but ${drift.length} attribute(s) ` +
      `(${drift.map((r) => r.attribute).join(', ')}) do not match what was expected. ` +
      'The configuration itself is what changed.';
  } else if (rows.length && rows.every((r) => r.verdict === RECONCILE.UNKNOWN)) {
    verdict = RECONCILE.UNKNOWN;
    summary = `Nothing about ${subject} could be read operationally, so no comparison is possible.`;
  } else {
    verdict = RECONCILE.ALIGNED;
    summary =
      `${subject} is configured and running consistently` +
      (expectedSource ? `, and matches ${expectedSource}` : '') +
      `.${unknown.length ? ` ${unknown.length} attribute(s) could not be read operationally.` : ''} ` +
      'That is a real result: if users are still suffering, the cause is not this configuration.';
  }

  return {
    subject,
    verdict,
    summary,
    expectedSource,
    // An expectation nobody supplied makes the left-hand column decorative, and
    // saying so stops the comparison from looking stronger than it is.
    hasExpectation: Object.keys(expected).length > 0,
    counts,
    rows,
    // The rows that become API gap entries: configured but not verifiable.
    unverifiable: unknown.map((r) => r.attribute),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Wireless specifics: turning real Gateway shapes into the three columns.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What a WLAN's CONFIGURED state is, from `/v1/services` plus the topology list.
 *
 * `defaultTopology` is an id; an id that resolves to nothing is the dangling
 * reference that broadcasts perfectly and passes no traffic.
 */
export function configuredWlanState(service, { topologies = [], profiles = [] } = {}) {
  if (!service) return {};
  const topo = topologies.find((t) => t.id === service.defaultTopology) ?? null;
  const bindings = profiles
    .flatMap((p) => (Array.isArray(p.radioIfList) ? p.radioIfList : []))
    .filter((b) => b?.serviceId === service.id || b?.service === service.id)
    .map((b) => b.radioIndex ?? b.index)
    .filter((i) => i !== undefined && i !== null);

  return {
    ssid: service.ssid ?? null,
    enabled: service.enabled ?? service.status ?? null,
    security: service.privacy?.mode ?? service.privacy?.type ?? service.securityMode ?? null,
    topologyId: service.defaultTopology ?? null,
    topologyName: topo?.name ?? null,
    vlan: topo?.vlanid ?? topo?.vlanId ?? null,
    radioIndices: bindings.length ? [...new Set(bindings)] : null,
  };
}

/**
 * What a WLAN's OBSERVED state is.
 *
 * Two independent readings, and the distinction matters:
 *   - `services[]` on a live AP is the AP telling us what it is actually
 *     carrying. The guidance note is explicit that this, not the profile, is
 *     what proves broadcast.
 *   - associated clients prove the SSID is not merely advertised but usable.
 */
export function observedWlanState(ssid, { apRows = [], clientRows = [] } = {}) {
  const carryingAps = apRows.filter((ap) =>
    (Array.isArray(ap.services) ? ap.services : []).some(
      (s) => String(s?.ssid ?? s) === String(ssid)
    )
  );
  const clients = clientRows.filter((c) => String(c.SSID ?? c.ssid) === String(ssid));
  const vlans = [...new Set(clients.map((c) => c.Vlan ?? c.VLAN ?? c.vlan).filter((v) => v != null && v !== ''))];

  return {
    // Absent rather than false when no AP inventory was read: "no APs carry it"
    // and "we did not look" are different answers.
    ssid: apRows.length || clients.length ? ssid : null,
    enabled: apRows.length ? carryingAps.length > 0 : null,
    apsCarrying: apRows.length ? carryingAps.length : null,
    associatedClients: clientRows.length ? clients.length : null,
    // The three-state payoff: the VLAN clients are ACTUALLY on.
    vlan: vlans.length === 1 ? vlans[0] : vlans.length ? vlans : null,
  };
}

/**
 * The attribute spec for a WLAN comparison.
 *
 * `security` and `radioIndices` are marked unobservable because this platform
 * exposes no operational read-back for either: an AP reports which SSIDs it
 * carries, not which cipher suite or radio index the Gateway believes it bound
 * them at. Marking them observable would let a silent drop pass as aligned.
 */
export const WLAN_SPEC = {
  ssid: {},
  enabled: {},
  security: { observable: false, note: 'No operational read-back for the cipher suite.' },
  topologyId: { observable: false, note: 'Configuration-side identifier; not reported by an AP.' },
  topologyName: { observable: false },
  radioIndices: {
    observable: false,
    note: 'An AP reports the SSIDs it carries, not the radio index the binding was written at. A binding written at the invalid index 0 is accepted and silently dropped, and cannot be read back.',
  },
  vlan: {},
};

/**
 * Reconcile one WLAN across the three states.
 *
 * @param {object} args
 * @param {string} args.ssid
 * @param {object} args.service        from /v1/services
 * @param {object[]} [args.topologies]
 * @param {object[]} [args.profiles]
 * @param {object[]} [args.apRows]
 * @param {object[]} [args.clientRows]
 * @param {object} [args.expected]     explicit intent, or a working peer's configured state
 * @param {string} [args.expectedSource]
 */
export function reconcileWlan({
  ssid,
  service,
  topologies = [],
  profiles = [],
  apRows = [],
  clientRows = [],
  expected = {},
  expectedSource = null,
} = {}) {
  const configured = configuredWlanState(service, { topologies, profiles });
  const observed = observedWlanState(ssid ?? configured.ssid, { apRows, clientRows });

  const result = reconcileState({
    subject: `WLAN ${ssid ?? configured.ssid ?? '(unnamed)'}`,
    expected,
    configured,
    observed,
    spec: WLAN_SPEC,
    expectedSource,
  });

  // A dangling topology is not a mismatch between columns — it is a
  // configuration that cannot resolve at all, and it presents as a perfectly
  // broadcasting SSID whose traffic has nowhere to go.
  if (configured.topologyId && !configured.topologyName) {
    result.rows.unshift({
      attribute: 'topologyResolves',
      expected: 'a topology that exists',
      configured: configured.topologyId,
      observed: null,
      verdict: RECONCILE.NOT_APPLIED,
      detail:
        `The WLAN references topology ${configured.topologyId}, which is not in the topology list. ` +
        'The SSID broadcasts normally and the traffic has nowhere to go.',
      note: null,
    });
    result.verdict = RECONCILE.NOT_APPLIED;
    result.summary = `WLAN ${ssid ?? configured.ssid} references a topology that does not resolve. ${result.summary}`;
  }

  return result;
}

/**
 * Use a working peer as the expectation.
 *
 * The most valuable reference on a multi-site estate and the one operators
 * reach for by instinct — "make this site match the one that works" — is a site
 * where users are fine. Attributes that are legitimately per-site (the SSID
 * name is not, but a topology id is) are excluded so the comparison does not
 * report every site as drifted from every other.
 */
export const PER_SITE_ATTRIBUTES = new Set(['topologyId', 'topologyName']);

export function expectationFromPeer(peerConfiguredState, { peerLabel = 'a working peer' } = {}) {
  const expected = {};
  for (const [k, v] of Object.entries(peerConfiguredState ?? {})) {
    if (PER_SITE_ATTRIBUTES.has(k)) continue;
    if (isAbsent(v)) continue;
    expected[k] = v;
  }
  return { expected, expectedSource: peerLabel };
}
