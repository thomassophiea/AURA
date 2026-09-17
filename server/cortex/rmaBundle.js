/**
 * The RMA evidence bundle — what someone raising a hardware case actually needs.
 *
 * WHY THIS IS PART OF THE FEATURE AND NOT A LATER TICKET
 * -----------------------------------------------------
 * A device-health assessment that stops at "RMA Recommended" hands the operator
 * the hardest half of the job. The evidence that justifies a replacement is
 * scattered across an inventory row, a state resource, an LLDP neighbour, a
 * reconstructed uptime series, a peer cohort and a list of things that were
 * deliberately ruled out — and re-gathering it by hand, under time pressure, is
 * where cases get raised with half the picture and bounced back.
 *
 * So the assessment and the bundle are one capability. Cortex offers the bundle
 * the moment it reaches RMA Recommended, and the bundle records the eliminations
 * as prominently as the faults, because "we proved it was not the switch" is the
 * part a reviewer needs and the part nobody writes down.
 *
 * WHAT THIS MODULE WILL NOT DO
 * ----------------------------
 * 1. IT DOES NOT CLAIM AN RMA. There is no authenticated Extreme support
 *    integration behind this, so no output here may say raised, approved,
 *    authorised or accepted. It produces a technical evidence package, and the
 *    wording is constrained by `FORBIDDEN_RMA_LANGUAGE` rather than by good
 *    intentions.
 *
 * 2. IT DOES NOT TRIGGER LOG COLLECTION. The platform's own mechanism is
 *    `PUT /v1/aps/{serial}/logs` — a write, and one `guardrails.js` classifies as
 *    disruptive. Cortex's investigation path is read-only by construction, and
 *    quietly poking hardware to enrich a report would break that for a
 *    convenience. The bundle therefore names the exact three calls and marks
 *    them as an operator action, with a measured note about which of them this
 *    Gateway build actually serves.
 *
 * 3. IT DOES NOT INVENT THE MISSING FIELDS. A support engineer will look for CPU,
 *    memory and temperature. This platform exposes none of them, and the bundle
 *    says so in its own section rather than leaving a reader to assume they were
 *    fine or forgotten.
 */

import { HEALTH, RMA, CHECK, CHECK_STATE, PLATFORM_GAPS, humanDuration } from './deviceHealth.js';

/**
 * The platform's log-collection sequence, as an instruction rather than an
 * action. Paths verified against `public/swagger.json`; availability verified
 * against the lab Gateway on 2026-09-17.
 */
export const LOG_COLLECTION_SEQUENCE = Object.freeze([
  {
    step: 1,
    method: 'PUT',
    path: '/v1/aps/{serial}/logs',
    what: 'Ask the AP to generate its diagnostic log set.',
    classification: 'disruptive',
    note: 'A write. Cortex does not issue it; an operator does, from AURA or the Gateway UI.',
  },
  {
    step: 2,
    method: 'GET',
    path: '/v1/aps/{serial}/traceurls',
    what: 'List the trace files the AP produced.',
    classification: 'read',
    note:
      'MEASURED 404 on this Gateway build (10.20.01) even though the path is in the API catalogue. ' +
      'Where it 404s, collect the logs from the Gateway UI or the AP shell instead.',
  },
  {
    step: 3,
    method: 'GET',
    path: '/v1/aps/downloadtrace/{file[,file...]}',
    what: 'Download the listed files as one tar.',
    classification: 'read',
    note: 'Comma-joined in a single request; it does not accept one file per call.',
  },
]);

/**
 * Wordings that assert an outcome only Extreme support can assert. Asserted by
 * test against every string the bundle emits.
 */
export const FORBIDDEN_RMA_LANGUAGE = [
  /\brma (has been |was )?(approved|authorised|authorized|raised|accepted|issued)\b/i,
  /\byour rma\b/i,
  /\breplacement (has been |is )?(approved|dispatched|shipped|on its way)\b/i,
  /\bcase (has been )?(opened|raised|created) with extreme\b/i,
];

/**
 * Sentences that are DENYING the outcome rather than asserting it.
 *
 * The guard's first version flagged the bundle's own disclaimer — "no RMA has
 * been raised, approved or authorised" — as an unauthorised claim, which is the
 * exact shape of the mistake the codebase already learned three times: a rule
 * that fires on careful wording stops being trusted and gets switched off. A
 * denial is the behaviour this module wants, so it must never trip the check.
 */
const RMA_DENIAL = new RegExp([
  String.raw`\bno rma\b`,
  String.raw`\bnot an rma\b`,
  String.raw`\b(is|was|has been|have been)? ?not (been )?(approved|authorised|authorized|raised|accepted|issued)\b`,
  String.raw`\bdo not describe\b`,
  String.raw`\bnever\b[^.!?]{0,40}\b(approved|authorised|authorized|raised)\b`,
].join('|'), 'i');

/**
 * True when a string makes a claim the bundle has no authority to make.
 *
 * Scoped per sentence so a denial in one place cannot launder a real assertion
 * in another — the same scoping rule `auditAnswer` applies, for the same reason.
 */
export function assertsUnauthorisedOutcome(text) {
  const sentences = String(text ?? '').split(/(?<=[.!?])\s+/);
  return sentences.some(
    (s) => FORBIDDEN_RMA_LANGUAGE.some((re) => re.test(s)) && !RMA_DENIAL.test(s)
  );
}

/**
 * Build the bundle.
 *
 * Every section states whether it was COLLECTED or is MISSING and why. A section
 * that is simply absent reads as an oversight; a section that says "not exposed
 * by this platform" is an answer.
 *
 * @param {object} args
 * @param {object} args.assessment      the output of `classifyDeviceHealth`
 * @param {object[]} args.checks        the raw checks behind it
 * @param {object} args.apRow           the /v1/aps/query row
 * @param {object} [args.state]         /v1/state/aps/{serial}
 * @param {object} [args.lldp]          /v1/aps/{serial}/lldp
 * @param {object} [args.rebootHistory] reconstructReboots() output
 * @param {object[]} [args.peers]       the comparable cohort
 * @param {object} [args.impact]        client impact summary
 * @param {object[]} [args.alarms]      device events
 * @param {object} [args.remediation]   { attempted: string[], resolved: boolean|null }
 * @param {string} [args.gatewayUrl]
 * @param {Date}   [args.now]
 */
export function buildRmaBundle({
  assessment,
  checks = [],
  apRow,
  state = null,
  lldp = null,
  rebootHistory = null,
  peers = [],
  impact = null,
  alarms = null,
  remediation = null,
  gatewayUrl = null,
  now = new Date(),
}) {
  const byId = new Map(checks.map((c) => [c.id, c]));
  const collected = [];
  const missing = [];

  /**
   * A section is MISSING only when it could not be obtained.
   *
   * An empty array from a read that worked is a RESULT — "no device events in
   * the window" — and the first version filed it under missingSections next to
   * things that genuinely failed. That is the same observed/unknown conflation
   * the whole feature exists to correct, committed inside the artefact meant to
   * demonstrate it. Callers say explicitly when empty means absent.
   */
  const section = (name, value, absentReason = null, { emptyIsMissing = false } = {}) => {
    const empty = Array.isArray(value) && value.length === 0;
    if (value === null || value === undefined || (empty && emptyIsMissing)) {
      missing.push({ section: name, reason: absentReason ?? 'not collected' });
      return null;
    }
    collected.push(name);
    return value;
  };

  const lldpRow = Array.isArray(lldp) ? lldp[0] : lldp;

  const bundle = {
    kind: 'ap-rma-evidence',
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    generatedBy: 'Aura Cortex — AI-First Device Health',

    /**
     * Stated first and stated plainly, because it is the single most likely
     * thing for a reader to get wrong about this document.
     */
    disclaimer:
      'This is a technical assessment and an evidence package. It is not an RMA, and no RMA has ' +
      'been raised, approved or authorised by producing it. Extreme support owns that decision and ' +
      'that process.',

    device: {
      hostname: apRow?.apName ?? apRow?.hostname ?? null,
      model: apRow?.platformName ?? null,
      hardwareType: apRow?.hardwareType ?? null,
      serialNumber: apRow?.serialNumber ?? null,
      macAddress: apRow?.macAddress ?? null,
      ipAddress: apRow?.ipAddress ?? null,
      site: apRow?.hostSite ?? null,
      // Site Group is the Gateway boundary; the AP row does not name it, so it
      // is reported as the Gateway rather than guessed.
      gateway: gatewayUrl,
      adoptedBy: apRow?.adoptedBy ?? null,
      profile: apRow?.profileName ?? null,
      environment: apRow?.environment ?? null,
    },

    verdict: {
      health: assessment?.health ?? HEALTH.UNKNOWN,
      rma: assessment?.rma ?? RMA.NONE,
      whyThisIsTheDevice: assessment?.rmaReasons ?? [],
      whatWouldChangeIt: assessment?.rmaBlockers ?? [],
      attributedLayer: assessment?.isolation?.attributedTo ?? null,
    },

    problemSummary: summarise(assessment, apRow),

    firmware: section('firmware', {
      running: apRow?.softwareVersion ?? null,
      prevailingAmongComparablePeers: byId.get(CHECK.FIRMWARE)?.evidence?.prevailing ?? null,
      comparablePeerCount: byId.get(CHECK.FIRMWARE)?.evidence?.comparableCount ?? null,
      isOutlier: byId.get(CHECK.FIRMWARE)?.state === CHECK_STATE.CONCERN,
      upgradeInProgress: byId.get(CHECK.FIRMWARE)?.evidence?.upgradeInProgress ?? null,
      note:
        'This Gateway publishes no per-AP target firmware. "Prevailing" is what comparable APs of ' +
        'the same model at the same site are running, and is stated as an inference.',
    }),

    uptimeAndRestarts: section('uptimeAndRestarts', rebootHistory?.available
      ? {
        currentUptimeSeconds: apRow?.sysUptime ?? null,
        currentUptime: apRow?.sysUptime ? humanDuration(apRow.sysUptime) : null,
        observedWindowHours: rebootHistory.windowHours,
        rebootsInWindow: rebootHistory.reboots?.length ?? 0,
        unexpectedLast24h: rebootHistory.unexpectedLast24h,
        upgradeCorrelatedLast24h: rebootHistory.upgradeCorrelatedLast24h,
        events: (rebootHistory.reboots ?? []).map((r) => ({
          at: new Date(r.at).toISOString(),
          previousUptimeSeconds: r.previousUptimeSeconds,
          upgradeCorrelated: r.upgradeCorrelated,
          reasonCode: null,
        })),
        note: rebootHistory.note,
      }
      : null,
    rebootHistory?.reason
      ?? 'No stored uptime series covers this AP, and the Gateway serves no reboot log, so a restart '
        + 'pattern could not be established.'),

    radios: section('radios', byId.get(CHECK.RADIO)?.evidence?.radios ?? null,
      'Radio state was not read.'),

    ethernetAndPower: section('ethernetAndPower', {
      ports: byId.get(CHECK.ETHERNET)?.evidence?.ports ?? null,
      negotiated: {
        mode: apRow?.ethMode ?? null,
        speed: apRow?.ethSpeed ?? null,
      },
      poe: {
        status: apRow?.ethPowerStatus ?? null,
        source: apRow?.pwrSource ?? null,
        drawWatts: apRow?.pwrUsage ?? null,
      },
      interfaceErrorCounters: byId.get(CHECK.INTERFACE_ERRORS)?.state === CHECK_STATE.UNMEASURED
        ? { available: false, why: byId.get(CHECK.INTERFACE_ERRORS)?.summary }
        : byId.get(CHECK.INTERFACE_ERRORS)?.evidence ?? null,
    }),

    upstream: section('upstream', lldpRow
      ? {
        switchName: lldpRow.systemName ?? null,
        switchSerial: lldpRow.switchSerial || null,
        switchPort: lldpRow.switchPort ?? null,
        switchDescription: lldpRow.systemDescription ?? null,
        source: '/v1/aps/{serial}/lldp',
      }
      : null,
    'LLDP returned no neighbour, so the upstream switch port is unidentified.'),

    tunnels: section('tunnels', byId.get(CHECK.TUNNEL)?.evidence?.tunnels ?? null,
      'The per-AP state read did not return tunnel status.'),

    // `alarms` is an array when the read worked — empty or not — and null when
    // it did not. An empty list IS the evidence that nothing was logged.
    events: section('events', Array.isArray(alarms) ? alarms.slice(0, 200) : null,
      byId.get(CHECK.EVENTS)?.summary ?? 'Device events were not retrieved.'),

    peerComparison: section('peerComparison', peers.length
      ? {
        basis: byId.get(CHECK.PEERS)?.evidence?.cohortBasis ?? null,
        cohortSize: peers.length,
        peers: peers.map((p) => ({
          hostname: p.apName ?? null,
          serialNumber: p.serialNumber,
          model: p.platformName ?? null,
          firmware: p.softwareVersion ?? null,
          status: p.status ?? null,
          uptimeSeconds: p.sysUptime ?? null,
        })),
        peersWithFaults: byId.get(CHECK.PEERS)?.evidence?.peersWithFaults ?? null,
      }
      : null,
    'No comparable APs of the same model at the same site were available to compare against.'),

    serviceImpact: section('serviceImpact', impact,
      byId.get(CHECK.IMPACT)?.summary ?? 'Client impact was not measured.'),

    /**
     * The part a reviewer needs most and the part nobody writes down: what was
     * checked and found NOT to be the cause.
     */
    alternativeCausesEliminated: (assessment?.isolation?.layers ?? [])
      .filter((l) => l.verdict === 'eliminated')
      .map((l) => ({
        layer: l.layer,
        eliminatedBy: l.basis,
        evidence: l.basis
          .map((id) => byId.get(id)?.summary)
          .filter(Boolean),
      })),

    alternativeCausesNotEliminated: (assessment?.isolation?.layers ?? [])
      .filter((l) => l.verdict !== 'eliminated')
      .map((l) => ({ layer: l.layer, verdict: l.verdict, detail: l.detail ?? null })),

    troubleshootingPerformed: {
      checksRun: checks.map((c) => ({
        check: c.id,
        outcome: c.state,
        reason: c.reason ?? null,
        finding: c.summary,
      })),
      remediationAttempted: remediation?.attempted ?? [],
      remediationOutcome: remediation?.resolved === true
        ? 'resolved'
        : remediation?.resolved === false
          ? 'did not resolve the condition'
          : 'none attempted',
    },

    /**
     * Named explicitly, because a support engineer will look for these three and
     * their silent absence would read as "nobody checked".
     */
    notCollectedBecauseThePlatformDoesNotExposeIt: Object.entries(PLATFORM_GAPS)
      .map(([id, why]) => ({ field: id, why })),

    missingSections: missing,
    collectedSections: collected,

    deviceLogs: {
      included: false,
      why:
        'Cortex\'s investigation path is read-only, and generating the AP log set is a write the ' +
        'platform classifies as disruptive. Run the sequence below as an operator and attach the tar.',
      sequence: LOG_COLLECTION_SEQUENCE.map((s) => ({
        ...s,
        path: s.path.replace('{serial}', apRow?.serialNumber ?? '{serial}'),
      })),
    },

    instruction:
      'This package supports a hardware case; it is not a case. Do not describe it as an approved, ' +
      'raised or authorised RMA. Sections listed in missingSections were not collected and the ' +
      'reason is given — do not present them as clean.',
  };

  return bundle;
}

/** One paragraph a support engineer can read first. */
function summarise(assessment, apRow) {
  const name = apRow?.apName ?? apRow?.serialNumber ?? 'This AP';
  const model = apRow?.platformName ? ` (${apRow.platformName})` : '';
  if (!assessment || assessment.rma === RMA.NONE) {
    return `${name}${model} has no evidence isolating a fault to its hardware.`;
  }
  const faults = (assessment.faults ?? []).map((f) => f.summary).join(' ');
  const eliminated = (assessment.isolation?.eliminated ?? []).join(', ');
  return (
    `${name}${model} is assessed ${assessment.health} with a verdict of ${assessment.rma}. ${faults} `
    + (eliminated
      ? `The following were measured and found not to be the cause: ${eliminated}.`
      : 'No alternative cause has been eliminated yet.')
  ).trim();
}

/**
 * A short, human-readable rendering for the chat, so the operator sees what they
 * are getting rather than a wall of JSON.
 */
export function renderBundleSummary(bundle) {
  const lines = [
    `RMA evidence package — ${bundle.device.hostname ?? bundle.device.serialNumber}`,
    `${bundle.device.model ?? 'unknown model'} · serial ${bundle.device.serialNumber ?? 'unknown'} · ${bundle.device.site ?? 'unknown site'}`,
    '',
    `Health: ${bundle.verdict.health}`,
    `RMA: ${bundle.verdict.rma}`,
    '',
    bundle.problemSummary,
    '',
    `Collected: ${bundle.collectedSections.join(', ') || 'nothing'}`,
  ];
  if (bundle.missingSections.length) {
    lines.push(
      `Not collected: ${bundle.missingSections.map((m) => `${m.section} (${m.reason})`).join('; ')}`);
  }
  lines.push(
    `Not exposed by this platform: ${bundle.notCollectedBecauseThePlatformDoesNotExposeIt.map((g) => g.field).join(', ')}`,
    '',
    'Device logs are not included — generating them is an operator action; the exact calls are in the package.',
  );
  return lines.join('\n');
}
