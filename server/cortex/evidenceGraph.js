/**
 * The evidence graph — what was actually established, and how strongly.
 *
 * WHY CONFIDENCE IS COMPUTED HERE AND NOT WRITTEN BY THE MODEL
 * -----------------------------------------------------------
 * The doctrine already forbids an invented numeric probability, on the grounds
 * that "an LLM-generated percentage is not a measurement". A LETTER grade
 * written by the same model is no better: it is a fluent restatement of how
 * confident the prose sounded. So the level is derived from properties of the
 * evidence that can be checked after the fact —
 *
 *   how many INDEPENDENT sources agree, whether the plumbing preflight actually
 *   ran, whether the discriminating reading was obtained or was a capability
 *   gap, how large the peer cohort was, and whether any read failed.
 *
 * The model is then TOLD the computed level and required to use it. That makes
 * the claim falsifiable: the ledger is written by the runtime, so a confidence
 * of HIGH can be audited against the calls that produced it.
 *
 * THE LADDER IS DELIBERATELY CAPPED, NOT AVERAGED
 * -----------------------------------------------
 * Evidence does not average. One failed read, one missing discriminator or one
 * cohort of two does not slightly lower a verdict — it puts a ceiling on it.
 * A diagnosis resting on three agreeing sources and one unobtainable
 * discriminator is LIKELY, not "mostly CONFIRMED".
 */

/** Where a claim sits between an observation and a proven cause. */
export const EPISTEMIC = {
  OBSERVED: 'observed',
  DERIVED: 'derived',
  HYPOTHESIS: 'hypothesis',
  PROBABLE_CAUSE: 'probable_cause',
  CONFIRMED_CAUSE: 'confirmed_cause',
};

/**
 * The confidence ladder. Ordered, so a cap is a numeric clamp rather than a
 * chain of special cases.
 */
export const CONFIDENCE = {
  INSUFFICIENT: 'INSUFFICIENT EVIDENCE',
  POSSIBLE: 'POSSIBLE',
  LIKELY: 'LIKELY',
  HIGH: 'HIGH CONFIDENCE',
  CONFIRMED: 'CONFIRMED',
};

const LADDER = [
  CONFIDENCE.INSUFFICIENT,
  CONFIDENCE.POSSIBLE,
  CONFIDENCE.LIKELY,
  CONFIDENCE.HIGH,
  CONFIDENCE.CONFIRMED,
];

const rank = (level) => Math.max(0, LADDER.indexOf(level));
const atMost = (level, ceiling) => (rank(level) > rank(ceiling) ? ceiling : level);

/**
 * Which fault domain a classifier verdict belongs to.
 *
 * Domains matter because "three sources agree" is only meaningful when they
 * agree about the SAME KIND of fault. Two RF findings and one addressing
 * finding are not corroboration; they are two separate problems, and treating
 * them as one is how a confident wrong root cause gets written.
 */
export const DOMAIN = {
  RF: 'rf',
  CAPACITY: 'capacity',
  ROAMING: 'roaming',
  ADDRESSING: 'addressing',
  AUTH: 'auth',
  NAMING: 'naming',
  CONFIG: 'config',
  INFRA: 'infra',
};

const TAXONOMY_DOMAIN = [
  [/coverage|weak signal|rss|snr/i, DOMAIN.RF],
  [/interference|co-?channel|airtime|utilization|utilisation|capacity|contention/i, DOMAIN.CAPACITY],
  [/roam|sticky|fast transition|\bft\b/i, DOMAIN.ROAMING],
  [/dhcp|address|ipv4|lease/i, DOMAIN.ADDRESSING],
  [/auth|802\.1x|radius|certificate|supplicant/i, DOMAIN.AUTH],
  [/dns|resolution/i, DOMAIN.NAMING],
  [/vlan|topology|binding|profile|wlan|ssid|config/i, DOMAIN.CONFIG],
  [/\bap\b|tunnel|poe|cable|uptime|reboot|firmware/i, DOMAIN.INFRA],
];

export function domainOf(taxonomy) {
  const text = String(taxonomy ?? '');
  for (const [re, domain] of TAXONOMY_DOMAIN) if (re.test(text)) return domain;
  return null;
}

/**
 * Tools that constitute an INDEPENDENT source.
 *
 * `diagnoseClient` and `getSiteOverview` both read MuTable, so two findings —
 * one from each — are one measurement seen twice, not two agreeing sources.
 * Counting them as two is the easiest way to manufacture false corroboration,
 * and the whole confidence ladder rests on getting this right.
 */
export const SOURCE_FAMILY = {
  findClient: 'client-telemetry',
  diagnoseClient: 'client-telemetry',
  getSiteOverview: 'client-telemetry',
  compareClientToPeers: 'client-telemetry',
  // Reads MuTable, exactly like getSiteOverview and diagnoseClient. Without an
  // entry here `sourceFamilyOf` fell back to `tool:correlateProblem`, so a
  // blast-radius result AGREEING with the site overview counted as two
  // independent sources when it is one table read twice — which is the precise
  // mechanism SOURCE_FAMILY exists to prevent, and it was inflating verdicts.
  correlateProblem: 'client-telemetry',
  // Services, topologies and profiles — the same reads getWlanConfig makes.
  reconcileConfiguration: 'configuration',
  checkBackendServices: 'plumbing',
  getRfHealth: 'radio-telemetry',
  getApHealth: 'ap-inventory',
  getWlanConfig: 'configuration',
  listSites: 'site-inventory',
  getClientTimeline: 'events',
  getRecentChanges: 'audit-log',
  getMetricHistory: 'stored-history',
  getClientHistory: 'stored-history',
  findVanishedDevices: 'stored-history',
  getCapabilities: 'capability-probe',
  // Service levels are computed by AURA's collector from the SAME monitoring
  // samples the three history tools read, so they belong to that family. Giving
  // them a family of their own would let "history says X" and "service levels
  // say X" count as two sources agreeing when it is one table read twice.
  getServiceLevels: 'stored-history',
  // Sentinel is genuinely independent: eight ACTIVE probes that reach out to
  // RADIUS, DHCP and DNS themselves rather than reading Gateway telemetry. It
  // corroborates the others honestly, which is the whole point of separating it.
  getInfrastructureAlerts: 'infra-probe',
};

export function sourceFamilyOf(tool) {
  return SOURCE_FAMILY[tool] ?? `tool:${tool}`;
}

/**
 * Reduce one tool payload to the fields a verdict can rest on.
 *
 * Deliberately small and deliberately structural: no free text, no
 * network-sourced names. The digest is stored on the ledger so the graph can be
 * rebuilt and audited without keeping whole payloads (a 1,700-token result per
 * call) or leaking a hostname into a place that is not fenced.
 */
export function digestToolResult(tool, payload) {
  const d = { tool, family: sourceFamilyOf(tool) };
  if (!payload || typeof payload !== 'object') return d;

  if (payload.basis) d.basis = payload.basis;
  if (payload.status) d.status = payload.status;
  if (payload.unavailable) d.unavailable = true;
  if (payload.scopeApplied) d.scopeApplied = payload.scopeApplied;

  // Classifier verdicts — severity and taxonomy only. The evidence strings stay
  // in the transcript where they are already fenced.
  const findings = Array.isArray(payload.findings) ? payload.findings : null;
  if (findings) {
    d.findings = findings.map((f) => ({
      severity: f?.severity ?? null,
      taxonomy: f?.taxonomy ?? null,
      domain: domainOf(f?.taxonomy),
    }));
  }

  // Fleet shape.
  if (payload.findingsSummary) d.findingsSummary = payload.findingsSummary;
  if (Number.isFinite(payload.clientsWithFindings)) {
    d.clientsWithFindings = payload.clientsWithFindings;
  }
  if (Number.isFinite(payload.clientCount)) d.clientCount = payload.clientCount;
  if (Number.isFinite(payload.scorableClients)) d.scorableClients = payload.scorableClients;
  if (Array.isArray(payload.worstClients)) {
    d.worstClientDomains = [
      ...new Set(
        payload.worstClients
          .flatMap((c) => (Array.isArray(c?.findings) ? c.findings : []))
          .map((f) => domainOf(f?.taxonomy))
          .filter(Boolean)
      ),
    ];
  }

  // The connection ladder: a named failing stage is the strongest single thing
  // this platform produces, because it localises the break rather than scoring it.
  if (payload.lifecycle) {
    d.lifecycle = {
      lastSuccessfulStage: payload.lifecycle.lastSuccessfulStage ?? null,
      firstFailingStage: payload.lifecycle.firstFailingStage ?? null,
      failureDomain: payload.lifecycle.failureDomain ?? null,
    };
  }

  // Plumbing preflight.
  if (payload.dhcp) {
    d.dhcp = {
      associatedClients: payload.dhcp.associatedClients ?? null,
      withoutIpv4: payload.dhcp.withoutIpv4 ?? null,
      share: payload.dhcp.share ?? null,
    };
  }
  if (payload.dns) {
    d.dns = { p50Ms: payload.dns.p50Ms ?? null, clientsMeasured: payload.dns.clientsMeasured ?? 0 };
  }
  if (payload.vlan) {
    d.vlan = { dangling: (payload.vlan.danglingTopologies ?? []).length };
  }
  if (payload.ntp?.basis) d.ntpBasis = payload.ntp.basis;

  // Service levels — the orientation read. The weakest metric at the worst site
  // is the verdict; the count of sites with no measurement at all is the part
  // that must not be mistaken for good news.
  if (Array.isArray(payload.worstFirst)) {
    const scored = payload.worstFirst.filter((s) => Number.isFinite(s?.overall));
    d.serviceLevels = {
      siteCount: payload.worstFirst.length,
      sitesScored: scored.length,
      worstOverall: scored.length ? scored[0].overall : null,
      worstStatus: scored.length ? scored[0].status ?? null : null,
      // Named, not the value — a metric name is ours, a site name is not.
      weakestMetricPresent: Boolean(scored.length && scored[0].weakestMetric),
      sitesUnmeasured: payload.worstFirst.length - scored.length,
    };
  }
  // A disagreement between two independent reads is itself evidence, and it
  // must reach the graph: it is the reason a verdict gets capped rather than
  // corroborated.
  if (Array.isArray(payload.contradictsLiveTelemetry)) {
    d.sourceConflicts = payload.contradictsLiveTelemetry.length;
  }

  // Infrastructure probes. `probesNeverRan` is the load-bearing field: a probe
  // that has not run contributes silence, and silence is not a pass.
  if (Array.isArray(payload.probes)) {
    d.infraProbes = {
      probeCount: payload.probes.length,
      neverRan: (payload.probesNeverRan ?? []).length,
      critical: payload.counts?.critical ?? 0,
      warning: payload.counts?.warning ?? 0,
      // A sustained condition, not a blip — the repeat count is what separates
      // them and the old resolver dropped it entirely.
      maxOccurrences: Array.isArray(payload.alerts)
        ? payload.alerts.reduce((max, a) => Math.max(max, Number(a?.occurrences) || 0), 0)
        : 0,
      probesAlerting: Array.isArray(payload.alerts)
        ? [...new Set(payload.alerts.map((a) => a?.probe).filter(Boolean))]
        : [],
    };
  }

  // Cohort size, which caps any claim about a population.
  if (Number.isFinite(payload.peerCount)) d.peerCount = payload.peerCount;
  if (Number.isFinite(payload.cohortSize)) d.peerCount = payload.cohortSize;
  if (Array.isArray(payload.peers)) d.peerCount = payload.peers.length;
  if (Number.isFinite(payload.totalMatches)) d.totalMatches = payload.totalMatches;

  return d;
}

/**
 * Was the plumbing preflight actually run, and did it come back clean?
 *
 * "A clean preflight is a RESULT, not a formality" — it is what licenses an RF
 * conclusion. Without it, an RF verdict is a guess that happens to be about
 * radios, and the ladder caps it accordingly.
 */
export function plumbingState(digests) {
  const p = digests.find((d) => d.family === 'plumbing' && d.status !== 'fetch_failed');
  if (!p) return { ran: false, clean: null, issues: [] };
  const issues = [];
  if (p.dhcp && Number.isFinite(p.dhcp.withoutIpv4) && p.dhcp.withoutIpv4 > 0) {
    issues.push({ domain: DOMAIN.ADDRESSING, detail: `${p.dhcp.withoutIpv4} associated clients hold no IPv4 address` });
  }
  if (p.vlan && p.vlan.dangling > 0) {
    issues.push({ domain: DOMAIN.CONFIG, detail: `${p.vlan.dangling} WLAN topology reference(s) do not resolve` });
  }
  // A DNS p50 is only meaningful when the Gateway actually measured some. Zero
  // measured clients is "not measured", not "fast".
  if (p.dns && p.dns.clientsMeasured > 0 && Number.isFinite(p.dns.p50Ms) && p.dns.p50Ms >= 100) {
    issues.push({ domain: DOMAIN.NAMING, detail: `DNS median ${p.dns.p50Ms} ms` });
  }
  return { ran: true, clean: issues.length === 0, issues };
}

/**
 * Build the graph from the evidence ledger.
 *
 * @param {Array} ledger  entries written by the investigation runtime
 * @returns {object}
 */
export function buildEvidenceGraph(ledger = []) {
  const entries = Array.isArray(ledger) ? ledger : [];
  const ok = entries.filter((l) => l.ok);
  const failed = entries.filter((l) => !l.ok);
  const digests = ok.map((l) => l.digest ?? { tool: l.tool, family: sourceFamilyOf(l.tool) });

  const families = [...new Set(digests.map((d) => d.family))];

  // Domain evidence, keyed by fault domain, counting INDEPENDENT families.
  const byDomain = new Map();
  const note = (domain, family, detail) => {
    if (!domain) return;
    if (!byDomain.has(domain)) byDomain.set(domain, { domain, families: new Set(), details: [] });
    const e = byDomain.get(domain);
    e.families.add(family);
    if (detail) e.details.push(detail);
  };

  for (const d of digests) {
    for (const f of d.findings ?? []) note(f.domain, d.family, f.taxonomy);
    for (const dom of d.worstClientDomains ?? []) note(dom, d.family, 'fleet finding');
    if (d.lifecycle?.failureDomain) {
      note(domainOf(d.lifecycle.failureDomain) ?? d.lifecycle.failureDomain, d.family, `lifecycle stage ${d.lifecycle.firstFailingStage ?? '?'}`);
    }
  }

  const plumbing = plumbingState(digests);
  for (const issue of plumbing.issues) note(issue.domain, 'plumbing', issue.detail);

  const domains = [...byDomain.values()]
    .map((e) => ({ domain: e.domain, independentSources: e.families.size, details: e.details }))
    .sort((a, b) => b.independentSources - a.independentSources);

  // Capability gaps reached during the investigation: a tool that answered
  // "this Gateway cannot report that" is evidence about the LIMITS, and it caps
  // what may be claimed.
  const gaps = digests.filter((d) => d.unavailable).map((d) => d.tool);

  const cohort = digests.reduce(
    (max, d) => (Number.isFinite(d.peerCount) ? Math.max(max, d.peerCount) : max),
    0
  );

  const lifecycle = digests.find((d) => d.lifecycle?.firstFailingStage)?.lifecycle ?? null;

  const impact = deriveImpact(digests);

  return {
    toolCalls: entries.length,
    successful: ok.length,
    failedReads: failed.map((f) => f.tool),
    families,
    domains,
    primaryDomain: domains[0]?.domain ?? null,
    plumbing,
    gaps,
    cohort,
    lifecycle,
    impact,
    digests,
  };
}

/**
 * Who is affected, out of how many, and what they share.
 *
 * This is the field an operator actually needs and the one Cortex was not
 * producing: the answers led with findings rather than with blast radius. It is
 * computed, so the prose can be checked against it.
 */
export function deriveImpact(digests = []) {
  const fleet = digests.find((d) => Number.isFinite(d.clientsWithFindings));
  if (fleet) {
    return {
      affected: fleet.clientsWithFindings,
      // scorableClients is the honest denominator: rows with placeholder signal
      // values are not clients that are "fine", they are not measurements.
      total: fleet.scorableClients ?? fleet.clientCount ?? null,
      unit: 'clients',
      basis: 'observed',
      scope: fleet.scopeApplied ?? null,
    };
  }
  const single = digests.find((d) => (d.findings ?? []).length > 0);
  if (single) {
    return { affected: 1, total: null, unit: 'clients', basis: 'observed', scope: single.scopeApplied ?? null };
  }
  return null;
}

/**
 * Classify confidence from the graph.
 *
 * Returns the level, the reasons that RAISED it, and the ceilings that held it
 * down — because "why is this only LIKELY?" is the question an engineer asks
 * next, and an unexplained grade is not usable.
 */
export function classifyConfidence(graph) {
  const raised = [];
  const ceilings = [];

  if (!graph || graph.successful === 0) {
    return {
      level: CONFIDENCE.INSUFFICIENT,
      raised: [],
      ceilings: ['No tool call succeeded, so there is nothing to be confident about.'],
      epistemic: EPISTEMIC.HYPOTHESIS,
    };
  }

  const top = graph.domains[0];
  if (!top) {
    return {
      level: CONFIDENCE.INSUFFICIENT,
      raised: [],
      ceilings: [
        'Reads succeeded but no classifier returned a finding, so no cause is identified. ' +
          'That is a real result: the values met expectations.',
      ],
      epistemic: EPISTEMIC.OBSERVED,
    };
  }

  let level = CONFIDENCE.POSSIBLE;

  // A classifier verdict is a platform judgement, not an inference of ours.
  level = CONFIDENCE.LIKELY;
  raised.push(`A classifier attributed the finding to ${top.domain}.`);

  // Independent corroboration inside the SAME domain.
  if (top.independentSources >= 2) {
    level = CONFIDENCE.HIGH;
    raised.push(`${top.independentSources} independent evidence sources agree on ${top.domain}.`);
  }

  // The plumbing preflight is what licenses an RF or capacity conclusion.
  const rfLike = top.domain === DOMAIN.RF || top.domain === DOMAIN.CAPACITY;
  if (rfLike && graph.plumbing.ran && graph.plumbing.clean) {
    level = CONFIDENCE.HIGH;
    raised.push('The plumbing preflight ran and was clean, which rules out the usual impostors.');
  }

  // A named failing lifecycle stage localises the break rather than scoring it.
  if (graph.lifecycle?.firstFailingStage) {
    level = CONFIDENCE.CONFIRMED;
    raised.push(
      `The connection ladder localises the break at "${graph.lifecycle.firstFailingStage}".`
    );
  }

  // ── Ceilings. These clamp; they do not average. ──────────────────────────
  if (rfLike && !graph.plumbing.ran) {
    ceilings.push(
      'The plumbing preflight was not run, so DHCP, DNS, NTP, VLAN and MTU have not been ruled out — every one of them presents with a perfect radio.'
    );
    level = atMost(level, CONFIDENCE.POSSIBLE);
  }
  if (graph.failedReads.length) {
    ceilings.push(
      `${graph.failedReads.length} read(s) failed (${[...new Set(graph.failedReads)].join(', ')}), so part of the picture is missing rather than clear.`
    );
    level = atMost(level, CONFIDENCE.LIKELY);
  }
  if (graph.gaps.length) {
    ceilings.push(
      `This Gateway cannot report ${graph.gaps.length} thing(s) the question touches, so the discriminating reading was unavailable.`
    );
    level = atMost(level, CONFIDENCE.LIKELY);
  }
  // A cohort smaller than three peers returns "too few peers to judge", never a
  // verdict — "most peers affected" derived from one peer is how a coincidence
  // becomes a work order.
  if (graph.impact && graph.impact.affected > 1 && graph.cohort > 0 && graph.cohort < 3) {
    ceilings.push(
      `The peer cohort was ${graph.cohort}, below the three needed to tell a shared cause from a coincidence.`
    );
    level = atMost(level, CONFIDENCE.POSSIBLE);
  }

  const epistemic =
    level === CONFIDENCE.CONFIRMED
      ? EPISTEMIC.CONFIRMED_CAUSE
      : rank(level) >= rank(CONFIDENCE.HIGH)
        ? EPISTEMIC.PROBABLE_CAUSE
        : rank(level) >= rank(CONFIDENCE.LIKELY)
          ? EPISTEMIC.DERIVED
          : EPISTEMIC.HYPOTHESIS;

  return { level, raised, ceilings, epistemic };
}

/**
 * The Cortex Standard: the ten questions every important answer should address.
 *
 * Each is either answered from the graph, or marked with WHY it is not — and
 * the "why" is the useful part. `api_gap` and `not_implemented` are the two that
 * become product feedback; `not_applicable` and `no_data` are ordinary.
 */
export function cortexStandard(graph, { remediation = null, verification = null } = {}) {
  const conf = classifyConfidence(graph);
  const unanswered = (reason, detail) => ({ answered: false, reason, detail });

  return {
    whatIsWrong: graph.primaryDomain
      ? { answered: true, value: graph.primaryDomain, sources: graph.domains[0].independentSources }
      : unanswered('no_data', 'No classifier returned a finding.'),

    whoIsAffected: graph.impact
      ? { answered: true, value: graph.impact }
      : unanswered('no_data', 'No population was measured.'),

    whenDidItStart: graph.families.includes('stored-history') || graph.families.includes('audit-log')
      ? { answered: true, value: 'established from stored history / the audit log' }
      : unanswered(
          'api_gap',
          'Gateway client telemetry serves a 3-hour window only; onset before that needs AURA stored history or the audit log, neither of which was read.'
        ),

    howWidespread: graph.impact?.total
      ? { answered: true, value: `${graph.impact.affected} of ${graph.impact.total} ${graph.impact.unit}` }
      : unanswered('no_data', 'No denominator was established, so a share cannot be stated.'),

    whatEvidence: { answered: graph.successful > 0, value: graph.families },

    rootCause:
      conf.epistemic === EPISTEMIC.CONFIRMED_CAUSE || conf.epistemic === EPISTEMIC.PROBABLE_CAUSE
        ? { answered: true, value: graph.primaryDomain, epistemic: conf.epistemic }
        : unanswered('insufficient_evidence', conf.ceilings[0] ?? 'Evidence supports a symptom, not a cause.'),

    confidence: { answered: true, value: conf.level, raised: conf.raised, ceilings: conf.ceilings },

    whatToDo: remediation?.proposals?.length
      ? { answered: true, value: remediation.proposals.map((p) => p.id) }
      : unanswered('no_match', 'No remediation in the catalogue follows from this diagnosis.'),

    canCortexDoIt: remediation
      ? { answered: true, value: remediation.executable?.length > 0, executable: remediation.executable ?? [] }
      : unanswered('not_applicable', 'No remediation was proposed.'),

    didTheFixWork: verification
      ? { answered: true, value: verification.verdict, stages: verification.stages }
      : unanswered('not_applicable', 'No change has been executed in this investigation.'),
  };
}

/**
 * The computed-confidence block for the system prompt.
 *
 * The model is told the level rather than asked for one. Without this the
 * grade is written by whichever sentence sounded most convincing.
 */
export function buildConfidenceBlock(graph) {
  if (!graph || graph.successful === 0) return '';
  const conf = classifyConfidence(graph);
  const lines = [
    `COMPUTED CONFIDENCE: ${conf.level}. This was derived from the evidence ledger by the runtime, not by you. Use this level; do not raise it.`,
  ];
  if (conf.raised.length) lines.push(`Supported by: ${conf.raised.join(' ')}`);
  if (conf.ceilings.length) lines.push(`Held down by: ${conf.ceilings.join(' ')}`);
  if (graph.impact) {
    lines.push(
      `MEASURED IMPACT: ${graph.impact.affected}${graph.impact.total ? ` of ${graph.impact.total}` : ''} ${graph.impact.unit}. Lead with this.`
    );
  }
  return lines.join('\n');
}
