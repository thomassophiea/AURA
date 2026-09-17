/**
 * Device health — is this access point capable of delivering its service, and
 * if not, is the access point itself the reason?
 *
 * WHY THIS IS NOT A TELEMETRY ROLLUP
 * ----------------------------------
 * Every field this module reads already existed. What did not exist was the
 * step an engineer performs between reading them and saying something useful:
 * `getApHealth` returned `status: "InService"` and a radio list, and an answer
 * built from it said the fleet was fine. "InService" is the Gateway's *adoption*
 * state. It is evidence, not a verdict — an AP reports InService while every
 * radio is off the air, and an AP that has fully lost adoption disappears from
 * inventory rather than appearing as broken.
 *
 * So this module does three things that a metric list cannot:
 *
 * 1. IT SEPARATES "MEASURED AND FINE" FROM "NOT MEASURED". A check has four
 *    states and `unmeasured` is never one of the good ones. This is the rule the
 *    whole file turns on: the previous behaviour reported a clean bill from an
 *    inventory row while CPU, memory, temperature and reboot history had never
 *    been looked at, because nothing in the payload said they were missing.
 *
 * 2. IT SEPARATES A PLATFORM GAP FROM A FAILED READ. Both leave a check
 *    unmeasured, and they mean opposite things. CPU is not exposed by this
 *    Gateway at all — probed, not assumed — so waiting for it is futile and an
 *    assessment must proceed and disclose it. A tunnel read that timed out, by
 *    contrast, is a hole in THIS assessment that another attempt could fill, and
 *    a verdict of Healthy over that hole is a guess.
 *
 * 3. IT REFUSES TO REACH THE AP BEFORE ELIMINATING EVERYTHING IN FRONT OF IT.
 *    The isolation ladder runs client → RF → upstream → configuration →
 *    firmware → hardware, and the hardware rung is only reachable when the ones
 *    before it were MEASURED and clean. An AP on a flapping PoE port and an AP
 *    with a failing radio look identical from the client's side; recommending a
 *    replacement for the first is the single most expensive mistake this feature
 *    can make.
 *
 * THE OUTPUT IS TWO INDEPENDENT AXES, ALWAYS BOTH STATED
 * -----------------------------------------------------
 *   health : Healthy | Degraded | Unhealthy | Unknown
 *   rma    : No RMA Indicated | RMA Candidate | RMA Recommended
 *
 * They are separate because they answer different questions and the wrong one
 * gets inferred otherwise. An AP can be Unhealthy with no RMA indicated (its
 * uplink is bad), and an operator left to infer replacement readiness from a
 * list of metrics will infer it wrongly in both directions.
 *
 * There is deliberately no numeric score. "AP health 63/100" is a fluent number
 * with no semantics, it cannot be argued with, and this platform publishes no
 * authoritative device-health index to anchor it to.
 */

/** The customer-facing health classification. Exactly these four. */
export const HEALTH = Object.freeze({
  HEALTHY: 'Healthy',
  DEGRADED: 'Degraded',
  UNHEALTHY: 'Unhealthy',
  UNKNOWN: 'Unknown',
});

/**
 * The RMA axis. Cortex performs a technical assessment; it never claims an RMA
 * has been raised, approved or authorised, because no authenticated Extreme
 * support integration exists to say so.
 */
export const RMA = Object.freeze({
  NONE: 'No RMA Indicated',
  CANDIDATE: 'RMA Candidate',
  RECOMMENDED: 'RMA Recommended',
});

/** Per-check outcome. `unmeasured` is NOT a pass and never contributes one. */
export const CHECK_STATE = Object.freeze({
  PASS: 'pass',
  CONCERN: 'concern',
  FAULT: 'fault',
  UNMEASURED: 'unmeasured',
});

/**
 * Why a check is unmeasured. The distinction drives the verdict:
 *
 *   platform_gap — this Gateway exposes no such reading, on any endpoint.
 *                  Probed against the live appliance, not assumed. An assessment
 *                  proceeds without it and DISCLOSES it.
 *   read_failed  — a request that should have answered did not. A hole in this
 *                  assessment. Blocks Healthy, because retrying could change it.
 *   no_history   — the reading exists live but no stored series covers the
 *                  window, so a TREND cannot be computed.
 *   not_applicable — the check does not apply to this device.
 */
export const UNMEASURED_REASON = Object.freeze({
  PLATFORM_GAP: 'platform_gap',
  READ_FAILED: 'read_failed',
  NO_HISTORY: 'no_history',
  NOT_APPLICABLE: 'not_applicable',
});

/** The mandatory investigation categories. */
export const CHECK = Object.freeze({
  OPERATIONAL: 'operational',
  FIRMWARE: 'firmware',
  CPU: 'cpu',
  MEMORY: 'memory',
  UPTIME: 'uptime',
  RADIO: 'radio',
  ETHERNET: 'ethernet',
  INTERFACE_ERRORS: 'interface_errors',
  UPLINK: 'uplink',
  CONFIG: 'config',
  POE: 'poe',
  TUNNEL: 'tunnel',
  THERMAL: 'thermal',
  EVENTS: 'events',
  PEERS: 'peers',
  IMPACT: 'impact',
});

/**
 * The layers an AP fault has to be isolated through, in order. The hardware rung
 * is last for a reason: everything above it is cheaper to test and far more
 * likely.
 */
export const LAYER = Object.freeze({
  CLIENT: 'client',
  RF: 'rf',
  UPSTREAM: 'network/upstream',
  CONFIG: 'configuration',
  FIRMWARE: 'firmware/software',
  HARDWARE: 'ap hardware',
});

export const ISOLATION_ORDER = [
  LAYER.CLIENT,
  LAYER.RF,
  LAYER.UPSTREAM,
  LAYER.CONFIG,
  LAYER.FIRMWARE,
  LAYER.HARDWARE,
];

/**
 * The layers that are NOT the device.
 *
 * A fault implicating any of these explains a device symptom without the
 * hardware being at fault, so it withdraws the device-specific verdict
 * entirely. Firmware is deliberately absent: it runs ON the AP, so an outlier
 * build is a cheaper remedy to try first rather than an alibi.
 */
export const EXTERNAL_LAYERS = [LAYER.CLIENT, LAYER.RF, LAYER.UPSTREAM, LAYER.CONFIG];

/**
 * Checks that must be MEASURED and clean before an AP may be called Healthy.
 *
 * CPU, memory and thermal are deliberately absent: this Gateway exposes none of
 * them (see PLATFORM_GAPS), so requiring them would make every AP permanently
 * Unknown, which is not more honest — it is just useless. Their absence is
 * carried in `limitations` instead and stated in every answer.
 */
export const REQUIRED_FOR_HEALTHY = [
  CHECK.OPERATIONAL,
  CHECK.FIRMWARE,
  CHECK.UPTIME,
  CHECK.RADIO,
  CHECK.ETHERNET,
  CHECK.POE,
  CHECK.TUNNEL,
];

/**
 * Readings this platform does not serve, established by probing the live
 * appliance on 2026-09-17 rather than by reading a spec.
 *
 * Recorded here so an assessment can say "not exposed" rather than "not
 * checked", and so the api-gap catalogue has one place to read them from.
 */
export const PLATFORM_GAPS = Object.freeze({
  [CHECK.CPU]:
    'AP CPU utilisation is not exposed. /v1/aps/query, /v1/aps/{serial}, ' +
    '/v1/state/aps/{serial} and the AP report widget set carry no CPU field, and ' +
    '/v1/aps/{serial}/statistics does not exist (404).',
  [CHECK.MEMORY]:
    'AP memory utilisation is not exposed on any AP endpoint this Gateway serves.',
  [CHECK.THERMAL]:
    'AP temperature and thermal events are not exposed. No thermal field appears on any AP ' +
    'resource; the sensor reads that exist are reachable only from the AP shell, not from REST.',
});

/** A reboot inside this window of a firmware change is an upgrade, not a fault. */
export const UPGRADE_CORRELATION_WINDOW_S = 30 * 60;

/**
 * Below this, a "fresh boot" is recent enough to be worth reporting. Above it,
 * uptime is positive stability evidence.
 */
export const RECENT_BOOT_S = 60 * 60;

/** Unexpected reboots in 24 h at or above this is a fault, not a blip. */
export const REBOOT_FAULT_24H = 3;
/** ...and at or above this it is worth flagging without yet being a fault. */
export const REBOOT_CONCERN_24H = 2;

/**
 * The smallest peer cohort that can distinguish a shared cause from a
 * coincidence. Same number the confidence ladder uses, for the same reason.
 */
export const MIN_PEER_COHORT = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Check construction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} Check
 * @property {string} id            one of CHECK
 * @property {string} state         one of CHECK_STATE
 * @property {string} [reason]      UNMEASURED_REASON, when state is unmeasured
 * @property {string} summary       one plain sentence
 * @property {object} [evidence]    the values the summary rests on
 * @property {string} [layer]       which isolation layer this check speaks to
 * @property {boolean} [deviceSpecific] true only when the fault points AT the AP
 */

export const pass = (id, summary, evidence = {}, layer = null) => ({
  id, state: CHECK_STATE.PASS, summary, evidence, layer,
});
export const concern = (id, summary, evidence = {}, layer = null, deviceSpecific = false) => ({
  id, state: CHECK_STATE.CONCERN, summary, evidence, layer, deviceSpecific,
});
export const fault = (id, summary, evidence = {}, layer = null, deviceSpecific = false) => ({
  id, state: CHECK_STATE.FAULT, summary, evidence, layer, deviceSpecific,
});
export const unmeasured = (id, reason, summary, evidence = {}) => ({
  id, state: CHECK_STATE.UNMEASURED, reason, summary, evidence,
});

/** The three permanent gaps, as checks, so they appear in every assessment. */
export function platformGapChecks() {
  return Object.entries(PLATFORM_GAPS).map(([id, why]) =>
    unmeasured(id, UNMEASURED_REASON.PLATFORM_GAP, why)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual checks. Each takes already-fetched evidence and returns a Check.
// They are pure so they can be tested without a Gateway.
// ─────────────────────────────────────────────────────────────────────────────

/** A number that is genuinely absent, rather than coerced to zero. */
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Operational state.
 *
 * `status` and `operationalStatus` are adoption states. The load-bearing part of
 * this check is the pairing with radio state elsewhere: InService on its own has
 * never been a health verdict and saying so is the point of the summary text.
 */
export function checkOperational({ apRow, state, stateReadFailed = false }) {
  if (!apRow) {
    return unmeasured(CHECK.OPERATIONAL, UNMEASURED_REASON.READ_FAILED,
      'AP inventory could not be read, so operational state is unknown.');
  }
  const status = apRow.status ?? null;
  const operational = state?.entityStatus?.operationalStatus ?? null;
  const troubles = state?.entityStatus?.troubles ?? [];

  const evidence = {
    status,
    operationalStatus: operational,
    adoptedBy: apRow.adoptedBy ?? null,
    ipAddress: apRow.ipAddress ?? null,
    // Measured empty even on a critical AP. Carried so the answer can say the
    // field exists and is silent, rather than implying it was consulted.
    troubleCount: Array.isArray(troubles) ? troubles.length : 0,
    troublesAreUnreliable: true,
  };

  if (stateReadFailed) {
    return unmeasured(CHECK.OPERATIONAL, UNMEASURED_REASON.READ_FAILED,
      `Inventory reports ${status ?? 'an unknown status'}, but the per-AP state read failed, ` +
      'so operational status and trouble flags could not be confirmed.', evidence);
  }
  if (status && status !== 'InService') {
    return fault(CHECK.OPERATIONAL, `The Gateway reports this AP as ${status}.`, evidence,
      LAYER.UPSTREAM, false);
  }
  if (operational && operational !== 'InService') {
    return fault(CHECK.OPERATIONAL, `Operational status is ${operational}.`, evidence,
      LAYER.UPSTREAM, false);
  }
  return pass(CHECK.OPERATIONAL,
    'The AP is adopted and in service. That is an adoption state, not a health verdict.',
    evidence, LAYER.UPSTREAM);
}

/**
 * Firmware consistency.
 *
 * The question is NOT "is every AP on an identical string". Different hardware
 * legitimately runs different builds, and an AP mid-upgrade is not defective.
 * The question is whether this AP is an UNEXPLAINED outlier among APs that
 * should match it — same model, same site.
 *
 * A firmware outlier is a REMEDIATION OPPORTUNITY, and it is also the thing that
 * most often explains behaviour otherwise blamed on hardware. It therefore both
 * raises a concern and blocks the RMA ladder until it is resolved.
 */
export function checkFirmware({ apRow, peers = [], peerBasis = 'model+site', upgrade = null }) {
  const running = apRow?.softwareVersion ?? null;
  if (!running) {
    return unmeasured(CHECK.FIRMWARE, UNMEASURED_REASON.READ_FAILED,
      'The running firmware version was not reported for this AP.');
  }
  const model = apRow.platformName ?? apRow.hardwareType ?? null;

  // Only APs that SHOULD match. Comparing an AP4000 against an AP5020 and
  // calling the difference a defect is the false positive this guards.
  const comparable = peers.filter((p) => p.softwareVersion);
  const evidence = {
    running,
    model,
    comparableCount: comparable.length,
    peerBasis,
    versionsInCohort: [...new Set(comparable.map((p) => p.softwareVersion))],
  };

  if (comparable.length < MIN_PEER_COHORT) {
    return unmeasured(CHECK.FIRMWARE, UNMEASURED_REASON.NOT_APPLICABLE,
      `Running ${running}. Only ${comparable.length} comparable AP(s) of the same model at the ` +
      'same site, which is too few to call this AP an outlier or to confirm it matches.',
      evidence);
  }

  // The mode of the cohort is the expectation this platform can actually
  // establish: the Gateway exposes no per-AP TARGET firmware, so "expected"
  // means "what comparable APs are running", and the summary says so.
  const counts = new Map();
  for (const p of comparable) counts.set(p.softwareVersion, (counts.get(p.softwareVersion) ?? 0) + 1);
  const [prevailing, prevailingCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  evidence.prevailing = prevailing;
  evidence.prevailingCount = prevailingCount;
  evidence.expectedVersionIsInferred = true;

  if (running === prevailing) {
    return pass(CHECK.FIRMWARE,
      `Running ${running}, the same build as ${prevailingCount} comparable ${model} AP(s) at this site.`,
      evidence, LAYER.FIRMWARE);
  }

  // An AP mid-upgrade is not an outlier, it is a device halfway through a
  // planned change. `/v2/report/upgrade/devices` is the only authority on this
  // and nothing in the product read it before — so the distinction was being
  // made by guesswork, or not at all.
  evidence.upgradeInProgress = upgrade?.inProgress ?? null;
  evidence.upgradeSource = upgrade ? '/v2/report/upgrade/devices' : null;
  if (upgrade?.inProgress === true) {
    return pass(CHECK.FIRMWARE,
      `Running ${running} against a prevailing ${prevailing}, but this AP is inside an upgrade ` +
      'group that is still running. That is a planned change in progress, not a firmware defect.',
      evidence, LAYER.FIRMWARE);
  }

  const upgradeClause = upgrade?.inProgress === false
    ? ' No upgrade group covers this AP, so it is not mid-upgrade.'
    : ' Whether an upgrade is in progress could not be confirmed.';
  return concern(CHECK.FIRMWARE,
    `Running ${running} while ${prevailingCount} comparable ${model} AP(s) at this site run ` +
    `${prevailing}. This Gateway publishes no target firmware per AP, so "expected" here means ` +
    `what comparable APs are running.${upgradeClause}`,
    evidence, LAYER.FIRMWARE, false);
}

/**
 * Uptime now, and unexpected reboots over the stored window.
 *
 * `sysUptime` is live and always available. Reboot HISTORY is not a Gateway
 * capability — it is reconstructed from AURA's own stored uptime series, and a
 * reset in that series is a reboot. `rebootHistory` is therefore optional, and
 * its absence is `no_history`, never a clean bill.
 *
 * A reboot within UPGRADE_CORRELATION_WINDOW_S of a firmware change is an
 * upgrade. Counting those as instability is how a well-run estate gets told its
 * APs are failing.
 */
export function checkUptime({ apRow, rebootHistory = null }) {
  const uptime = num(apRow?.sysUptime);
  if (uptime === null) {
    return unmeasured(CHECK.UPTIME, UNMEASURED_REASON.READ_FAILED,
      'The AP did not report an uptime value.');
  }
  const evidence = { uptimeSeconds: uptime, uptimeHuman: humanDuration(uptime) };

  if (!rebootHistory || rebootHistory.available !== true) {
    const why = rebootHistory?.reason ?? 'no stored uptime series covers this AP';
    const ev = { ...evidence, historyReason: why, rebootHistoryAvailable: false };

    // CURRENT UPTIME IS ITSELF A LOWER BOUND ON TIME SINCE THE LAST RESTART.
    //
    // The first version of this check returned `unmeasured` here unconditionally,
    // which made UPTIME — a required check — permanently unsatisfiable on any
    // deployment with no stored series, so every AP in the estate came back
    // Unknown. Caught by the tool tests, and it would have shipped as "Cortex
    // cannot assess any of your APs".
    //
    // It was also wrong on the evidence. An AP reporting three days of uptime
    // has demonstrably not restarted in three days; that is a measurement, not
    // an assumption. What is genuinely missing is the pattern BEFORE that
    // window, which is a narrower claim and belongs in the limitations rather
    // than in the verdict.
    if (uptime >= RECENT_BOOT_S) {
      return pass(CHECK.UPTIME,
        `Up ${humanDuration(uptime)}, so it has not restarted in that period. A longer-term restart ` +
        `pattern could not be checked (${why}) — the Gateway keeps no reboot log, so that history ` +
        'comes from AURA\'s stored uptime series.',
        ev, LAYER.HARDWARE);
    }

    // A short uptime with no history is the case that must NOT pass: the AP
    // restarted recently and there is no way to tell whether it is a pattern.
    return concern(CHECK.UPTIME,
      `The AP has been up for only ${humanDuration(uptime)} — it restarted recently — and the ` +
      `restart history could not be reconstructed (${why}), so whether this repeats is unknown.`,
      ev, LAYER.HARDWARE, false);
  }

  const unexpected = rebootHistory.unexpectedLast24h ?? 0;
  const planned = rebootHistory.upgradeCorrelatedLast24h ?? 0;
  Object.assign(evidence, {
    windowHours: rebootHistory.windowHours ?? null,
    rebootsLast24h: rebootHistory.rebootsLast24h ?? 0,
    unexpectedLast24h: unexpected,
    upgradeCorrelatedLast24h: planned,
    reboots: rebootHistory.reboots ?? [],
    // No reason code exists for any of them; the summary must not imply one.
    reasonCodesAvailable: false,
  });

  if (unexpected >= REBOOT_FAULT_24H) {
    return fault(CHECK.UPTIME,
      `${unexpected} unexpected restarts in the last 24 hours (currently up ${humanDuration(uptime)}). ` +
      'The Gateway carries no restart reason code; that is in the tech-support archive.',
      evidence, LAYER.HARDWARE, true);
  }
  if (unexpected >= REBOOT_CONCERN_24H) {
    return concern(CHECK.UPTIME,
      `${unexpected} unexpected restarts in the last 24 hours (currently up ${humanDuration(uptime)}).`,
      evidence, LAYER.HARDWARE, true);
  }
  if (unexpected === 1 && uptime < RECENT_BOOT_S) {
    return concern(CHECK.UPTIME,
      `One unexpected restart in the last 24 hours; the AP came back ${humanDuration(uptime)} ago. ` +
      'A single restart is not a failure pattern.',
      evidence, LAYER.HARDWARE, false);
  }
  if (planned > 0 && unexpected === 0) {
    return pass(CHECK.UPTIME,
      `Up ${humanDuration(uptime)}. The ${planned} restart(s) in the window coincide with a ` +
      'firmware change, so they were upgrades rather than faults.',
      evidence, LAYER.HARDWARE);
  }
  return pass(CHECK.UPTIME,
    `Up ${humanDuration(uptime)} with no unexpected restarts in the stored window.`,
    evidence, LAYER.HARDWARE);
}

/**
 * Radio operational state.
 *
 * The tell this check exists for: an AP can be InService with every radio off
 * the air. `adminState` says what was asked for; `opChannel` and `txPower` say
 * what is actually happening. A radio administratively disabled is a
 * CONFIGURATION state, not a fault — conflating the two reports a deliberate
 * 2.4 GHz shutdown as a broken AP.
 */
export function checkRadios({ apRow }) {
  const radios = Array.isArray(apRow?.radios) ? apRow.radios : null;
  if (!radios) {
    return unmeasured(CHECK.RADIO, UNMEASURED_REASON.READ_FAILED,
      'No radio list was returned for this AP.');
  }
  if (!radios.length) {
    return unmeasured(CHECK.RADIO, UNMEASURED_REASON.READ_FAILED,
      'The AP reported an empty radio list, which is not a valid state for an adopted AP.');
  }

  const detail = radios.map((r) => {
    const txPower = num(r.txPower);
    const raw = r.opChannel ?? r.channel ?? null;
    // "Off" IS THE STRING THE GATEWAY SENDS. It is not null, so a truthiness
    // test on the channel reads a disabled radio as tuned — measured on four
    // lab APs. Every off-air comparison below goes through this normalisation.
    const off = raw === null || /^off$/i.test(String(raw));
    // 6 GHz waiting on Automated Frequency Coordination. A regulatory wait, not
    // a fault: the radio is working and is not permitted to transmit yet.
    const afcPending = /afc.?pending/i.test(String(raw ?? ''));
    return {
      radioIndex: r.radioIndex ?? null,
      band: { 1: '2.4GHz', 2: '5GHz', 3: '6GHz' }[r.radioIndex] ?? null,
      // Carried, but NOT trusted as a discriminator — see the note below.
      adminState: r.adminState ?? null,
      opChannel: raw,
      txPower,
      clients: num(r.clients),
      afcPending,
      onAir: !off && !afcPending && txPower !== null && txPower > 0,
    };
  });

  const silent = detail.filter((r) => !r.onAir && !r.afcPending);
  const awaitingAfc = detail.filter((r) => r.afcPending);
  const evidence = {
    radioCount: detail.length,
    radios: detail,
    onAirCount: detail.filter((r) => r.onAir).length,
    awaitingAfc: awaitingAfc.map((r) => r.band ?? r.radioIndex),
    // MEASURED, AND IT IS THE REASON THIS CHECK CANNOT ATTRIBUTE A CAUSE.
    //
    // Every radio on the lab fleet reports adminState true, INCLUDING the ones
    // showing opChannel "Off" at 0 dBm. So the platform gives no way to tell a
    // deliberately-disabled radio from one that is enabled and not on the air.
    // Saying "this radio failed" from these fields alone would be a guess.
    adminStateDiscriminates: false,
  };

  if (awaitingAfc.length && !silent.length) {
    return pass(CHECK.RADIO,
      `${evidence.onAirCount} of ${detail.length} radios on the air; ` +
      `${awaitingAfc.length} is waiting on AFC authorisation for 6 GHz, which is a regulatory wait ` +
      'rather than a fault.',
      evidence, LAYER.HARDWARE);
  }

  // A radio that is enabled and not on the air is a REAL and important finding,
  // and it has four possible causes: no service bound to it, a regulatory hold,
  // the AP shedding radios on insufficient power, or the radio itself. This
  // check reports the condition; the isolation ladder decides which. Claiming
  // hardware here — the first version did — turns a PoE problem into a
  // replacement.
  const CANDIDATES =
    'A radio that is enabled and off the air has four possible causes: no WLAN bound to it in the ' +
    'profile, a regulatory hold, the AP shedding radios on insufficient power, or the radio itself. ' +
    'This Gateway reports adminState as true even for these radios, so it does not separate them.';

  if (silent.length === detail.length) {
    // Device-specific AS A SYMPTOM — an AP serving nothing is a device-level
    // problem. `classifyDeviceHealth` withdraws that the moment an EXTERNAL
    // layer (power, uplink, configuration) is implicated, because any of those
    // fully explains it without the hardware being at fault.
    return fault(CHECK.RADIO,
      `Every radio is off the air — no operating channel and zero transmit power — while the AP ` +
      `reports as in service. The AP is serving nothing. ${CANDIDATES}`,
      evidence, LAYER.HARDWARE, true);
  }
  if (silent.length) {
    // NO LAYER. A subset of radios off is not evidence about the hardware — the
    // overwhelmingly common cause is that no WLAN is bound to that band — and
    // implicating the hardware layer put "attributed to: ap hardware" on a lab
    // AP whose only finding was a 2.4 GHz radio with nothing to broadcast.
    return concern(CHECK.RADIO,
      `${silent.length} of ${detail.length} radios are off the air ` +
      `(${silent.map((r) => r.band ?? `index ${r.radioIndex}`).join(', ')}). ${CANDIDATES}`,
      evidence, null, false);
  }
  return pass(CHECK.RADIO, `All ${detail.length} radios are on the air.`, evidence, LAYER.HARDWARE);
}

/**
 * Ethernet uplink.
 *
 * This is an UPSTREAM check and its findings are never device-specific. An AP
 * behind a renegotiating switch port produces every symptom of a failing AP, and
 * this is the check that stops that becoming a replacement.
 */
export function checkEthernet({ apRow, tunnelsUp = null }) {
  const ports = Array.isArray(apRow?.ethPorts) ? apRow.ethPorts : null;
  if (!ports) {
    return unmeasured(CHECK.ETHERNET, UNMEASURED_REASON.READ_FAILED,
      'No Ethernet port list was returned for this AP.');
  }
  // `speedNA` on a second port is an unused port, not a fault. Only ports that
  // are actually up are judged.
  const live = ports.filter((p) => p.speed && p.speed !== 'speedNA');
  const evidence = {
    ports: ports.map((p) => ({ name: p.name, speed: p.speed, mode: p.mode, power: p.power })),
    livePortCount: live.length,
    ethMode: apRow.ethMode ?? null,
    ethSpeed: apRow.ethSpeed ?? null,
    // The upstream switch and port, when the Gateway knows it. This is what
    // turns "check the uplink" into an actionable instruction.
    switchPorts: (apRow.switchPorts ?? []).filter(Boolean),
    lag: apRow.lag ?? null,
    // Not exposed anywhere on this platform.
    interfaceErrorCountersAvailable: false,
  };

  if (!live.length) {
    // AN AP WITH NO WIRED LINK THAT IS STILL TALKING TO THE GATEWAY IS MESH-
    // BACKHAULED, NOT BROKEN.
    //
    // Measured: AP4020-PVT-05_MESH_RELAY reports both ports at speedNA and was
    // faulted as "no Ethernet link" while it was adopted, tunnelled and serving
    // three clients over a wireless backhaul. The tunnel state already proves
    // the uplink works; no extra read is needed to tell the two apart.
    if (tunnelsUp === true) {
      return pass(CHECK.ETHERNET,
        'No wired link, and the Gateway tunnel is up — this AP is reaching the Gateway over a ' +
        'wireless backhaul. That is a mesh deployment, not a failed uplink.',
        { ...evidence, backhaul: 'wireless' }, LAYER.UPSTREAM);
    }
    return fault(CHECK.ETHERNET,
      'No Ethernet port reports a link' +
      `${tunnelsUp === false ? ' and no Gateway tunnel is up' : ''}.`,
      evidence, LAYER.UPSTREAM, false);
  }
  const halfDuplex = live.filter((p) => p.mode && /half/i.test(p.mode));
  if (halfDuplex.length) {
    return fault(CHECK.ETHERNET,
      `${halfDuplex.map((p) => p.name).join(', ')} negotiated half duplex, which will throttle and ` +
      'retransmit under load. This is a switch-port or cabling condition, not an AP defect.',
      evidence, LAYER.UPSTREAM, false);
  }
  return pass(CHECK.ETHERNET,
    `Uplink up at ${live.map((p) => `${p.name} ${p.speed}`).join(', ')}, full duplex. ` +
    'Interface error counters are not exposed by this Gateway, so a clean link here is a link-state ' +
    'check, not an error-rate check.',
    evidence, LAYER.UPSTREAM);
}

/**
 * Ethernet interface error and discard counters.
 *
 * These exist in the API's own schema (`IfStatsElement.inErrors`, `outErrors`,
 * `inDiscards`, `outDiscards`) and NOTHING in the product has ever read them,
 * because the only route that carries them — `/v1/aps/ifstats` — answers 500 on
 * some builds. That is exactly the situation this check is written for: attempt
 * the read, and when it fails, record a named hole and carry on rather than
 * abandoning the investigation.
 *
 * Deliberately NOT in REQUIRED_FOR_HEALTHY. A route known to be unreliable must
 * not be able to make every AP Unknown; its absence belongs in `limitations`,
 * where the answer will state it.
 */
export function checkInterfaceErrors({ ifstats = null, readFailed = false, error = null }) {
  if (readFailed || !ifstats) {
    return unmeasured(CHECK.INTERFACE_ERRORS, UNMEASURED_REASON.READ_FAILED,
      'Interface error and discard counters could not be read. /v1/aps/ifstats is the only route ' +
      `that carries them and it is unreliable on this build${error ? ` (${error})` : ''}. Link state ` +
      'was still checked; an error RATE was not.');
  }

  const wired = Array.isArray(ifstats.wired) ? ifstats.wired : [];
  const wireless = Array.isArray(ifstats.wireless) ? ifstats.wireless : [];

  // MEASURED ON THIS PLATFORM (AP5020, 2026-09-17): `wired` comes back as an
  // empty array while `wireless` is fully populated. The resource answered — so
  // this is not a failed read — but the Ethernet counters simply are not served.
  // Reporting an "error rate of 0%" from an empty array would be the worst kind
  // of wrong: a fabricated clean bill on the exact link an RMA case turns on.
  if (!wired.length && !wireless.length) {
    return unmeasured(CHECK.INTERFACE_ERRORS, UNMEASURED_REASON.PLATFORM_GAP,
      'The interface statistics resource answered with no interface rows at all.');
  }

  const rate = (rows) => {
    const errors = rows.reduce((n, r) => n + (num(r.inErrors) ?? 0) + (num(r.outErrors) ?? 0), 0);
    const discards = rows.reduce((n, r) => n + (num(r.inDiscards) ?? 0) + (num(r.outDiscards) ?? 0), 0);
    // A raw counter is meaningless without its denominator: 8 errors against
    // 56,000 packets is a clean interface. Without a total, the count is
    // reported AS a count and never scored against an invented threshold.
    const packets = rows.reduce(
      (n, r) => n + (num(r.inUPackets) ?? 0) + (num(r.outUPackets) ?? 0)
        + (num(r.inMPackets) ?? 0) + (num(r.outMPackets) ?? 0), 0);
    return { errors, discards, packets, ratio: packets ? errors / packets : null };
  };

  const wiredStats = rate(wired);
  const wirelessStats = rate(wireless);
  const evidence = {
    wiredInterfaceRows: wired.length,
    wiredCountersServed: wired.length > 0,
    wireless: wireless.map((r) => ({
      radio: r.id ?? null,
      adminStatus: r.adminStatus ?? null,
      operStatus: r.operStatus ?? null,
      inErrors: num(r.inErrors),
      outErrors: num(r.outErrors),
      inDiscards: num(r.inDiscards),
      outDiscards: num(r.outDiscards),
    })),
    wiredErrorRate: wiredStats.ratio,
    wirelessErrorRate: wirelessStats.ratio,
  };

  // A radio the AP itself reports as administratively up but operationally down
  // is the strongest single device-level signal this platform produces about a
  // radio, and nothing read it before.
  const radioDown = wireless.filter((r) => r.adminStatus === true && r.operStatus === false);
  if (radioDown.length) {
    return fault(CHECK.INTERFACE_ERRORS,
      `${radioDown.length} radio interface(s) report admin up but operationally down ` +
      `(${radioDown.map((r) => `radio ${r.id}`).join(', ')}).`,
      evidence, LAYER.HARDWARE, true);
  }

  if (!wired.length) {
    const wirelessPart = wirelessStats.ratio === null
      ? ''
      : ` Radio interfaces report an error rate of ${(wirelessStats.ratio * 100).toFixed(4)}% ` +
        `(${wirelessStats.errors} of ${wirelessStats.packets} frames), which is normal wireless retry behaviour, not a link fault.`;
    return unmeasured(CHECK.INTERFACE_ERRORS, UNMEASURED_REASON.PLATFORM_GAP,
      'The Ethernet interface carries no statistics row on this build, so uplink error and discard ' +
      `counters are not available — link state was checked, an error rate was not.${wirelessPart}`,
      evidence);
  }

  if (wiredStats.ratio === null) {
    return concern(CHECK.INTERFACE_ERRORS,
      `${wiredStats.errors} Ethernet error(s) reported, but the packet totals needed to turn that ` +
      'into a rate were not. Reported as a count, not scored.',
      evidence, LAYER.UPSTREAM, false);
  }
  if (wiredStats.ratio >= 0.001) {
    return fault(CHECK.INTERFACE_ERRORS,
      `Ethernet error rate is ${(wiredStats.ratio * 100).toFixed(3)}% ` +
      `(${wiredStats.errors} of ${wiredStats.packets} frames). That is a cabling, switch-port or ` +
      'duplex condition on the uplink, not an AP defect.',
      evidence, LAYER.UPSTREAM, false);
  }
  return pass(CHECK.INTERFACE_ERRORS,
    `Ethernet error rate is ${(wiredStats.ratio * 100).toFixed(4)}% ` +
    `(${wiredStats.errors} of ${wiredStats.packets} frames).`,
    evidence, LAYER.UPSTREAM);
}

/**
 * Who the AP is plugged into, from LLDP.
 *
 * Purely identifying, never a fault on its own — LLDP can be off, and that is a
 * configuration choice. It earns its place because it is what turns "the uplink
 * looks wrong" into an instruction someone can act on: a switch serial and a
 * port number. Without it, an upstream finding is advice to go and look.
 */
export function checkUplink({ lldp = null, readFailed = false }) {
  if (readFailed || !lldp) {
    return unmeasured(CHECK.UPLINK, UNMEASURED_REASON.NOT_APPLICABLE,
      'The upstream switch and port could not be identified from LLDP. An upstream finding will ' +
      'name the condition but not the port to check.');
  }
  const row = Array.isArray(lldp) ? lldp[0] : lldp;
  const evidence = {
    switchSerial: row?.switchSerial ?? null,
    switchPort: row?.switchPort ?? null,
    portDescription: row?.portDescrition ?? row?.portDescription ?? null,
    systemName: row?.systemName ?? null,
    managementAddress: row?.managementAddress ?? null,
  };
  if (!evidence.switchSerial && !evidence.switchPort && !evidence.systemName) {
    return unmeasured(CHECK.UPLINK, UNMEASURED_REASON.NOT_APPLICABLE,
      'LLDP returned no neighbour, so the upstream switch port is unidentified.', evidence);
  }
  return pass(CHECK.UPLINK,
    `Uplinked to ${evidence.systemName ?? evidence.switchSerial ?? 'a switch'}` +
    `${evidence.switchPort ? ` port ${evidence.switchPort}` : ''}.`,
    evidence, null);
}

/**
 * Power over Ethernet.
 *
 * Also upstream. An AP on insufficient power sheds radios and restarts, which
 * reads from every other angle as a failing AP.
 */
export function checkPoe({ apRow }) {
  const status = apRow?.ethPowerStatus ?? null;
  const source = apRow?.pwrSource ?? apRow?.powerSource ?? null;
  const usage = num(apRow?.pwrUsage);
  if (status === null && source === null && usage === null) {
    return unmeasured(CHECK.POE, UNMEASURED_REASON.READ_FAILED,
      'No power fields were returned for this AP.');
  }
  const evidence = {
    ethPowerStatus: status,
    powerSource: source,
    powerUsageWatts: usage,
    forcePoEPlus: apRow?.forcePoEPlus ?? null,
    // The Gateway reports the negotiated class and the draw, not the budget the
    // switch has left. Saying so stops "13.6 W" being read as headroom.
    switchBudgetAvailable: false,
  };

  // The three values this platform actually emits, measured across the lab
  // fleet: normal, low, high. They are NOT three grades of the same thing.
  //
  //   low  — the port is supplying less than the AP wants. The AP responds by
  //          shedding radios and can restart under load. AURA's own AP detail
  //          page already calls this a PoE issue, and it is the classic
  //          impostor for a failing AP.
  //   high — the port supplies more than the AP needs. That is headroom, not a
  //          fault, and treating it as one would flag a correctly provisioned AP.
  const s = String(status ?? '').toLowerCase();
  if (/low|reduced|insufficient|denied|fault/.test(s)) {
    return fault(CHECK.POE,
      `Power status is "${status}" — the switch port is supplying less than this AP wants. An AP on ` +
      'insufficient power sheds radios and can restart under load. This is a switch-port, cabling ' +
      'or power-budget condition, not an AP defect.',
      evidence, LAYER.UPSTREAM, false);
  }
  if (s && s !== 'normal' && s !== 'high') {
    return concern(CHECK.POE,
      `Power status is "${status}", which is neither the normal nor the known-good "high" reading. ` +
      'Reporting it rather than scoring it.',
      evidence, LAYER.UPSTREAM, false);
  }
  if (usage !== null && usage <= 0 && status) {
    // A live AP drawing nothing is a sensor that is not reporting, not an AP
    // running on air. Treated as suspect telemetry, not as a fault.
    return concern(CHECK.POE,
      `Power status is "${status}" but the reported draw is ${usage} W, which is not a plausible ` +
      'figure for a running AP. Treating the reading as unreliable rather than as evidence.',
      { ...evidence, suspectReading: true }, LAYER.UPSTREAM, false);
  }
  return pass(CHECK.POE,
    `Powered from ${source ?? 'the uplink'}, status ${status ?? 'unreported'}` +
    `${s === 'high' ? ' (the port supplies more than this AP needs, which is headroom)' : ''}` +
    `${usage === null ? '' : `, drawing ${usage} W`}. The switch's remaining power budget is not ` +
    'exposed by this Gateway.',
    evidence, LAYER.UPSTREAM);
}

/**
 * Configuration state for this AP.
 *
 * This rung of the isolation ladder had nothing filling it, which made
 * "configuration has been ruled out" permanently unreachable and — since the RMA
 * ladder requires it — made RMA Recommended unreachable too. Caught by the
 * ladder's own tests rather than in production, which is the argument for having
 * written them.
 *
 * Two things are genuinely readable and both change how an AP behaves:
 *
 *   `ovr` — an AP-level override is set. An override can suppress a radio
 *   binding the profile grants, which presents as "the AP is not carrying the
 *   WLAN" and looks like a hardware fault from every other angle.
 *
 *   `apVlanStatus` — the VLANs the AP actually holds, against the ones the
 *   services on its OWN profile need. Scoped to its own profile deliberately:
 *   comparing every AP against every service on the box flagged half the lab
 *   fleet the first time it was tried.
 */
export function checkConfiguration({ apRow, state, stateReadFailed = false, vlanGaps = null }) {
  if (!apRow) {
    return unmeasured(CHECK.CONFIG, UNMEASURED_REASON.READ_FAILED,
      'AP inventory could not be read, so its configuration could not be checked.');
  }
  const evidence = {
    profileName: apRow.profileName ?? null,
    apLevelOverride: apRow.ovr ?? null,
    rfMgmtPolicy: apRow.rfMgmtPolicyName ?? null,
    vlansPresent: stateReadFailed ? null : (state?.apVlanStatus ?? null),
  };

  if (!apRow.profileName) {
    return fault(CHECK.CONFIG,
      'This AP is not assigned to a configuration profile, so it has no WLANs to carry.',
      evidence, LAYER.CONFIG, false);
  }
  if (stateReadFailed) {
    return unmeasured(CHECK.CONFIG, UNMEASURED_REASON.READ_FAILED,
      `Assigned to profile "${apRow.profileName}", but the per-AP state read failed so its VLAN ` +
      'bindings could not be confirmed.', evidence);
  }
  if (Array.isArray(vlanGaps) && vlanGaps.length) {
    evidence.missingForWlans = vlanGaps;
    return fault(CHECK.CONFIG,
      `The AP is missing the VLAN(s) that ${vlanGaps.length} WLAN(s) on its own profile need. This ` +
      'presents as a client fault while the SSID broadcasts perfectly.',
      evidence, LAYER.CONFIG, false);
  }
  // `ovr` is NOT raised as a concern on its own. Measured on the lab Gateway:
  // four of eight APs carry an override as their normal, intended state, so
  // flagging it would put half a healthy fleet into Degraded — and an audit that
  // cries wolf stops being read. It stays in the evidence, where an answer about
  // a MISSING WLAN can reach for it, which is the only question it bears on.
  return pass(CHECK.CONFIG,
    `Assigned to profile "${apRow.profileName}" with the VLANs its own WLANs need` +
    `${apRow.ovr === true ? '; an AP-level override is present, which is common and not a fault on its own' : ''}.`,
    evidence, LAYER.CONFIG);
}

/**
 * Tunnel state to each Gateway, including the MTU pair.
 *
 * MTU is the one backend cause with no symptom anywhere else: association and
 * small packets succeed while TLS and large transfers fail, on a perfect radio.
 */
export function checkTunnels({ state, stateReadFailed = false }) {
  if (stateReadFailed || !state) {
    return unmeasured(CHECK.TUNNEL, UNMEASURED_REASON.READ_FAILED,
      'The per-AP state read failed, so tunnel and MTU status could not be checked.');
  }
  const tunnels = Array.isArray(state.controllerApTunnelStatus) ? state.controllerApTunnelStatus : [];
  if (!tunnels.length) {
    return unmeasured(CHECK.TUNNEL, UNMEASURED_REASON.READ_FAILED,
      'The AP state carried no tunnel list.');
  }
  const detail = tunnels.map((t) => ({
    gateway: t.addr,
    status: t.status,
    tunnel: t.tunnel,
    configMtu: t.configMtu ?? null,
    apLearnedMtu: t.apLearnedMtu ?? null,
    mtuStatus: t.configMtuTunnelStatus ?? null,
    managementTunnelStatus: t.internalManagementTunnelStatus ?? null,
  }));
  const evidence = { tunnels: detail };

  const down = detail.filter((t) => t.status && !/^normal$/i.test(String(t.status)));
  if (down.length === detail.length) {
    return fault(CHECK.TUNNEL, 'No Gateway tunnel is in a normal state.', evidence, LAYER.UPSTREAM, false);
  }
  if (down.length) {
    return concern(CHECK.TUNNEL,
      `${down.length} of ${detail.length} Gateway tunnels are not normal (${down.map((t) => `${t.gateway}: ${t.status}`).join(', ')}).`,
      evidence, LAYER.UPSTREAM, false);
  }
  // THE DATA PATH AND THE MANAGEMENT PATH ARE NOT THE SAME FINDING.
  //
  // Measured across the whole lab fleet: every tunnel reports
  // `configMtuTunnelStatus: "Normal"` alongside
  // `internalManagementTunnelStatus: "MtuFailed"`. The first version of this
  // check treated either as an MTU fault and therefore put 8 of 8 APs into
  // Degraded — a fleet-wide concern that turned out to be a platform default,
  // and an audit that flags everything gets switched off.
  //
  // The data path is what carries client traffic and it is what a client
  // symptom hangs off. A management-path MTU state on its own is recorded and
  // reported, not scored.
  const dataPathBad = detail.filter((t) => t.mtuStatus && !/^normal$/i.test(String(t.mtuStatus)));
  const learnedBelowConfig = detail.filter(
    (t) => Number.isFinite(t.configMtu) && Number.isFinite(t.apLearnedMtu)
      && t.apLearnedMtu > 0 && t.apLearnedMtu < t.configMtu
  );
  const mgmtOnly = detail.filter(
    (t) => t.managementTunnelStatus && !/^normal$/i.test(String(t.managementTunnelStatus))
  );
  evidence.dataPathMtuIssues = dataPathBad.length + learnedBelowConfig.length;
  evidence.managementPathMtuIssues = mgmtOnly.length;

  if (dataPathBad.length || learnedBelowConfig.length) {
    return concern(CHECK.TUNNEL,
      `The data tunnel's MTU does not agree with the Gateway on ` +
      `${dataPathBad.length + learnedBelowConfig.length} tunnel(s). This presents as association and ` +
      'small packets working while TLS and large transfers fail, on a perfect radio — and it is a ' +
      'network path condition, not an AP defect.',
      evidence, LAYER.UPSTREAM, false);
  }
  return pass(CHECK.TUNNEL,
    `All ${detail.length} Gateway tunnels normal and the data-path MTU is negotiated` +
    `${mgmtOnly.length
      ? `. The internal MANAGEMENT tunnel reports ${mgmtOnly[0].managementTunnelStatus} on ` +
        `${mgmtOnly.length} of them; the data path is unaffected and this reads the same on every AP here`
      : ''}.`,
    evidence, LAYER.UPSTREAM);
}

/**
 * Device events and alarms.
 *
 * `/v1/aps/{serial}/alarms` is not in the Gateway's published catalogue and
 * answers on some builds only. An EMPTY list from a working endpoint and an
 * endpoint that is not there are different answers, and the caller must tell
 * this function which it got — collapsing them is how "no alarms" gets reported
 * for a box that was never asked.
 */
export function checkEvents({ alarms = null, available = null, activeAlerts = null }) {
  if (available === false) {
    return unmeasured(CHECK.EVENTS, UNMEASURED_REASON.PLATFORM_GAP,
      'This Gateway build does not serve the per-AP alarm history endpoint, so device events ' +
      'could not be reviewed.');
  }
  if (available === null || alarms === null) {
    return unmeasured(CHECK.EVENTS, UNMEASURED_REASON.READ_FAILED,
      'The per-AP alarm read did not complete, so device events could not be reviewed.');
  }
  const list = Array.isArray(alarms) ? alarms : [];
  const active = Array.isArray(activeAlerts) ? activeAlerts : [];
  const evidence = {
    alarmCount: list.length,
    activeAlertCount: active.length,
    severities: countBy(list, (a) => a.level ?? a.severity ?? 'unknown'),
    // No reason codes exist for reboots or deauthentications anywhere in REST.
    reasonCodesAvailable: false,
  };
  const severe = list.filter((a) => /critical|major|error/i.test(String(a.level ?? a.severity ?? '')));
  if (severe.length) {
    evidence.severeCount = severe.length;
    return concern(CHECK.EVENTS,
      `${severe.length} critical or major device event(s) in the window.`, evidence, null, false);
  }
  if (active.length) {
    return concern(CHECK.EVENTS, `${active.length} active alert(s) on this AP.`, evidence, null, false);
  }
  return pass(CHECK.EVENTS,
    list.length
      ? `${list.length} device event(s) in the window, none critical or major.`
      : 'No device events recorded in the window.',
    evidence);
}

/**
 * Peer comparison — the check that turns "this AP has a problem" into "this AP,
 * and not the site, has a problem".
 *
 * Peers must be genuinely comparable. Comparing an AP5020 against an AP3000, or
 * an AP at one site against an AP at another, produces a difference that means
 * nothing, and a cohort under three cannot tell a shared cause from a
 * coincidence.
 */
export function checkPeers({ apRow, peers = [], peerFaults = new Map() }) {
  const model = apRow?.platformName ?? apRow?.hardwareType ?? null;
  const site = apRow?.hostSite ?? null;
  const evidence = {
    cohortBasis: `same model (${model ?? 'unknown'}) at the same site (${site ?? 'unknown'})`,
    cohortSize: peers.length,
  };
  if (peers.length < MIN_PEER_COHORT) {
    return unmeasured(CHECK.PEERS, UNMEASURED_REASON.NOT_APPLICABLE,
      `Only ${peers.length} comparable AP(s) — same model at the same site — which is below the ` +
      `${MIN_PEER_COHORT} needed to tell a device-specific problem from a shared one.`,
      evidence);
  }
  const unhealthyPeers = peers.filter((p) => (peerFaults.get(p.serialNumber) ?? 0) > 0);
  evidence.peersWithFaults = unhealthyPeers.length;
  evidence.peerSerialsWithFaults = unhealthyPeers.map((p) => p.serialNumber);

  if (unhealthyPeers.length === 0) {
    return pass(CHECK.PEERS,
      `All ${peers.length} comparable ${model} APs at this site are clean, so a fault here would ` +
      'be specific to this device rather than shared.',
      evidence);
  }
  if (unhealthyPeers.length >= Math.ceil(peers.length / 2)) {
    return concern(CHECK.PEERS,
      `${unhealthyPeers.length} of ${peers.length} comparable APs show the same condition. That is a ` +
      'shared cause — site, switch, firmware or configuration — not a device-specific fault.',
      evidence, LAYER.UPSTREAM, false);
  }
  return concern(CHECK.PEERS,
    `${unhealthyPeers.length} of ${peers.length} comparable APs also show findings.`, evidence);
}

/**
 * Customer and service impact.
 *
 * Device abnormalities matter when they cost someone their wireless. This check
 * deliberately distinguishes one client from many clients on one AP, because
 * only the second is evidence about the AP.
 */
export function checkImpact({ clientCount = null, clientsWithFindings = null, measured = true, reason = null }) {
  if (!measured) {
    return unmeasured(CHECK.IMPACT, UNMEASURED_REASON.READ_FAILED,
      `Client impact could not be measured (${reason ?? 'client telemetry unavailable'}), so whether ` +
      'anyone is affected is unknown.');
  }
  const evidence = { clientsOnAp: clientCount, clientsWithFindings };
  if (clientCount === 0) {
    return unmeasured(CHECK.IMPACT, UNMEASURED_REASON.NOT_APPLICABLE,
      'No clients are associated to this AP, so there is no service impact to measure. An idle AP ' +
      'is not evidence of a healthy one.', evidence);
  }
  if (clientsWithFindings === null) {
    return unmeasured(CHECK.IMPACT, UNMEASURED_REASON.READ_FAILED,
      `${clientCount} client(s) are associated but their telemetry was not scored.`, evidence);
  }
  if (clientsWithFindings === 0) {
    return pass(CHECK.IMPACT,
      `${clientCount} client(s) associated, none with findings.`, evidence, LAYER.CLIENT);
  }
  if (clientsWithFindings === 1 && clientCount > 2) {
    return concern(CHECK.IMPACT,
      `1 of ${clientCount} clients on this AP has findings. One affected client out of several is ` +
      'evidence about that client, not about the AP.', evidence, LAYER.CLIENT, false);
  }
  return fault(CHECK.IMPACT,
    `${clientsWithFindings} of ${clientCount} clients on this AP have findings.`,
    evidence, LAYER.RF, false);
}

// ─────────────────────────────────────────────────────────────────────────────
// Classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Turn the checks into the two verdicts, the isolation state and the honest
 * list of what could not be established.
 *
 * @param {Check[]} checks
 * @param {object} [opts]
 * @param {object} [opts.remediation]  { attempted: string[], resolved: boolean|null }
 * @returns {object}
 */
export function classifyDeviceHealth(checks, { remediation = null } = {}) {
  const byId = new Map(checks.map((c) => [c.id, c]));
  const faults = checks.filter((c) => c.state === CHECK_STATE.FAULT);
  const concerns = checks.filter((c) => c.state === CHECK_STATE.CONCERN);

  // Two kinds of hole, and they are not interchangeable.
  const platformGaps = checks.filter(
    (c) => c.state === CHECK_STATE.UNMEASURED && c.reason === UNMEASURED_REASON.PLATFORM_GAP);
  const failedReads = checks.filter(
    (c) => c.state === CHECK_STATE.UNMEASURED && c.reason === UNMEASURED_REASON.READ_FAILED);
  const noHistory = checks.filter(
    (c) => c.state === CHECK_STATE.UNMEASURED && c.reason === UNMEASURED_REASON.NO_HISTORY);

  // A required check that is unmeasured for a RECOVERABLE reason blocks Healthy.
  // A permanent platform gap does not — it is disclosed instead.
  const blockingHoles = REQUIRED_FOR_HEALTHY
    .map((id) => byId.get(id))
    .filter((c) => !c || (c.state === CHECK_STATE.UNMEASURED
      && c.reason !== UNMEASURED_REASON.PLATFORM_GAP
      && c.reason !== UNMEASURED_REASON.NOT_APPLICABLE));

  const isolationPre = isolate(checks);

  /**
   * A HARDWARE-LAYER FAULT IS NOT DEVICE-SPECIFIC WHILE A LOWER RUNG IS
   * IMPLICATED.
   *
   * This is the ladder's own logic applied to the verdict, and leaving it out
   * was a real defect: three lab APs with every radio off the air AND a switch
   * port supplying insufficient power were classified Unhealthy with an RMA
   * Candidate each, while the isolation block on the same object correctly said
   * "network/upstream". Insufficient power is a complete explanation for a
   * radio that will not come up; the AP is the last thing to suspect, not the
   * first.
   */
  // Only the layers OUTSIDE the device exonerate it. Firmware is the AP's own
  // software: an outlier build is a cheaper thing to fix first, not evidence
  // that the hardware is fine, so it stays a blocker on the RMA ladder rather
  // than withdrawing the device-specific verdict.
  const lowerRungImplicated = EXTERNAL_LAYERS.includes(isolationPre.attributedTo);
  const deviceSpecificFaults = lowerRungImplicated
    ? []
    : faults.filter((f) => f.deviceSpecific);

  let health;
  if (faults.length) {
    // A fault that points at the device is Unhealthy. A fault that points
    // upstream is real and serious, but the AP is not the thing that is wrong,
    // so it is Degraded with an isolation verdict that names the layer.
    health = deviceSpecificFaults.length ? HEALTH.UNHEALTHY : HEALTH.DEGRADED;
  } else if (concerns.length) {
    health = HEALTH.DEGRADED;
  } else if (blockingHoles.length) {
    health = HEALTH.UNKNOWN;
  } else {
    health = HEALTH.HEALTHY;
  }

  // A verdict of Unhealthy built entirely on top of unmeasured required checks
  // is not a verdict. Faults are real findings, so they still stand — but if
  // EVERY required check is a hole and nothing was found, Unknown is the answer.
  if (health === HEALTH.HEALTHY && blockingHoles.length) health = HEALTH.UNKNOWN;

  const isolation = isolationPre;
  const rma = assessRma({ checks, health, isolation, remediation, lowerRungImplicated });

  return {
    health,
    rma: rma.verdict,
    rmaReasons: rma.reasons,
    rmaBlockers: rma.blockers,
    isolation,
    // The standard shape the evidence graph, the UI and auditAnswer consume.
    findings: deviceHealthFindings(checks),
    faults: faults.map(describe),
    concerns: concerns.map(describe),
    passed: checks.filter((c) => c.state === CHECK_STATE.PASS).map((c) => c.id),
    /**
     * What could not be established, split by whether another attempt could fix
     * it. The answer contract requires these to be stated — a Healthy verdict
     * that hides them is the exact failure this feature was built to correct.
     */
    limitations: {
      platformGaps: platformGaps.map(describe),
      failedReads: failedReads.map(describe),
      noHistory: noHistory.map(describe),
    },
    blockedHealthyBy: blockingHoles.map((c) => c?.id ?? 'missing check'),
    suspectTelemetry: checks
      .filter((c) => c.evidence?.suspectReading)
      .map((c) => ({ check: c.id, summary: c.summary })),
    /**
     * Whether a longer-term restart pattern could be established at all.
     *
     * Surfaced separately because it is the one limitation that changes what an
     * RMA verdict can rest on: without it, "this keeps happening" is an
     * operator's word rather than a measurement.
     */
    rebootHistoryAvailable: byId.get(CHECK.UPTIME)?.evidence?.rebootHistoryAvailable !== false,
    instruction:
      health === HEALTH.UNKNOWN
        ? 'Health is UNKNOWN. Do NOT report this AP as healthy, and do not report it as faulty. ' +
          'Say which readings were missing and why.'
        : health === HEALTH.HEALTHY
          ? 'Health is Healthy. State the RMA line too, and name the readings this platform does ' +
            'not expose in one closing sentence — do not imply CPU, memory or temperature were checked.'
          : 'State the classification, the RMA line, and which isolation layers have been ' +
            'eliminated with what evidence.',
  };
}

/**
 * Project the checks into the codebase's standard `findings[]` shape.
 *
 * Nothing new is decided here — it is the same verdicts in the shape the
 * evidence graph, the UI and `auditAnswer` already understand. Taxonomy leaves
 * reuse the names `capabilityRegistry` already publishes ("AP Health / Radio
 * Disabled", "AP Health / Low Power") so a device-health finding and a
 * capability entry describe the same thing with the same words.
 */
export function deviceHealthFindings(checks) {
  const TAXONOMY = {
    [CHECK.OPERATIONAL]: 'AP Health / Out of Service',
    [CHECK.FIRMWARE]: 'AP Health / Firmware Outlier',
    [CHECK.UPTIME]: 'AP Health / Unexpected Restart',
    [CHECK.RADIO]: 'AP Health / Radio Disabled',
    [CHECK.ETHERNET]: 'AP Health / Uplink',
    [CHECK.INTERFACE_ERRORS]: 'AP Health / Uplink Errors',
    [CHECK.POE]: 'AP Health / Low Power',
    [CHECK.TUNNEL]: 'AP Health / Tunnel',
    [CHECK.CONFIG]: 'Configuration / AP Binding',
    [CHECK.EVENTS]: 'AP Health / Device Events',
    [CHECK.PEERS]: 'AP Health / Shared Cause',
    [CHECK.IMPACT]: 'Capacity / Client Impact',
  };
  return checks
    .filter((c) => c.state === CHECK_STATE.FAULT || c.state === CHECK_STATE.CONCERN)
    .map((c) => ({
      severity: c.state === CHECK_STATE.FAULT ? 'critical' : 'warning',
      taxonomy: TAXONOMY[c.id] ?? `AP Health / ${c.id}`,
      summary: c.summary,
      evidence: c.evidence ?? {},
      deviceSpecific: c.deviceSpecific ?? false,
    }));
}

const describe = (c) => ({
  check: c.id,
  state: c.state,
  reason: c.reason ?? null,
  summary: c.summary,
  layer: c.layer ?? null,
  deviceSpecific: c.deviceSpecific ?? false,
});

/**
 * Walk the isolation ladder.
 *
 * A layer is ELIMINATED only when a check that speaks to it was measured and
 * clean. A layer with no measured check is `unexamined`, which is different from
 * eliminated and is the difference between a diagnosis and a guess.
 */
export function isolate(checks) {
  const layers = ISOLATION_ORDER.map((layer) => {
    const speaking = checks.filter((c) => c.layer === layer);
    const measured = speaking.filter((c) => c.state !== CHECK_STATE.UNMEASURED);
    const bad = measured.filter((c) => c.state !== CHECK_STATE.PASS);
    if (!measured.length) {
      return { layer, verdict: 'unexamined', basis: speaking.map((c) => c.id) };
    }
    if (bad.length) {
      return {
        layer,
        verdict: 'implicated',
        basis: bad.map((c) => c.id),
        detail: bad.map((c) => c.summary),
      };
    }
    return { layer, verdict: 'eliminated', basis: measured.map((c) => c.id) };
  });

  const implicated = layers.filter((l) => l.verdict === 'implicated');
  // The lowest implicated layer in ladder order is the one to act on: a bad
  // uplink explains everything above it and must be fixed before anything below
  // it is even considered.
  const attributedTo = implicated.length ? implicated[0].layer : null;
  return {
    layers,
    attributedTo,
    eliminated: layers.filter((l) => l.verdict === 'eliminated').map((l) => l.layer),
    unexamined: layers.filter((l) => l.verdict === 'unexamined').map((l) => l.layer),
    hardwareReachable:
      layers.find((l) => l.layer === LAYER.HARDWARE)?.verdict === 'implicated'
      && [LAYER.UPSTREAM, LAYER.CONFIG, LAYER.FIRMWARE].every((needed) =>
        layers.find((l) => l.layer === needed)?.verdict === 'eliminated'),
  };
}

/**
 * The RMA assessment.
 *
 * Deliberately hard to reach, and it states its BLOCKERS as well as its reasons
 * so an operator can see what would have to be true. Every gate below exists
 * because skipping it produces a replacement for a working AP:
 *
 *  - a device-specific fault must exist (not high CPU, not one client, not a
 *    counter, not a single reboot, not missing telemetry)
 *  - the upstream layers must be MEASURED and clean, not merely unexamined
 *  - the AP must not be a firmware outlier — that is a remediation, not a defect
 *  - the peer cohort must be at least three and comparable
 *  - RECOMMENDED additionally needs recurrence and exhausted remediation
 */
export function assessRma({ checks, health, isolation, remediation = null, lowerRungImplicated = false }) {
  const reasons = [];
  const blockers = [];
  const byId = new Map(checks.map((c) => [c.id, c]));

  const deviceFaults = lowerRungImplicated
    ? []
    : checks.filter((c) => c.state === CHECK_STATE.FAULT && c.deviceSpecific);
  if (!deviceFaults.length) {
    return {
      verdict: RMA.NONE,
      reasons: [
        lowerRungImplicated
          ? `The ${isolation.attributedTo} layer is implicated and explains these symptoms without `
            + 'invoking the hardware. Fix that first and re-assess.'
          : health === HEALTH.UNKNOWN
            ? 'No RMA assessment is possible without evidence; nothing here points at the hardware.'
            : 'No fault isolates to this AP\'s hardware.',
      ],
      blockers: [],
    };
  }
  reasons.push(...deviceFaults.map((f) => f.summary));

  // A remediation that WORKED settles the question before any other gate is
  // considered. Evaluating the blockers first left this unreachable, so an AP
  // whose fault had already been fixed still read as a replacement candidate.
  if (remediation?.resolved === true && (remediation.attempted ?? []).length) {
    return {
      verdict: RMA.NONE,
      reasons: [
        `The condition resolved after ${remediation.attempted.join(', ')}, so it was not a hardware fault.`,
      ],
      blockers: [],
    };
  }

  // Upstream must be ELIMINATED, not merely quiet.
  for (const layer of [LAYER.UPSTREAM, LAYER.CONFIG]) {
    const l = isolation.layers.find((x) => x.layer === layer);
    if (l?.verdict === 'implicated') {
      blockers.push(`The ${layer} layer is implicated (${l.basis.join(', ')}) and explains these ` +
        'symptoms without invoking the hardware. Fix that first.');
    } else if (l?.verdict !== 'eliminated') {
      blockers.push(`The ${layer} layer was not examined, so it has not been ruled out.`);
    }
  }

  // A firmware outlier is a remediation opportunity, and taking it is cheaper
  // and faster than a replacement.
  const fw = byId.get(CHECK.FIRMWARE);
  if (fw?.state === CHECK_STATE.CONCERN) {
    blockers.push('This AP is a firmware outlier among comparable APs. Align the firmware and ' +
      're-assess before treating the condition as a hardware defect.');
  } else if (fw?.state === CHECK_STATE.UNMEASURED) {
    blockers.push('Firmware consistency could not be established, so a software cause has not ' +
      'been ruled out.');
  }

  // Peers.
  const peers = byId.get(CHECK.PEERS);
  if (peers?.state === CHECK_STATE.UNMEASURED) {
    blockers.push(`The comparable-AP cohort was too small (under ${MIN_PEER_COHORT}) to separate a ` +
      'device-specific fault from a shared one.');
  } else if (peers?.state === CHECK_STATE.CONCERN && peers.layer === LAYER.UPSTREAM) {
    blockers.push('Comparable APs show the same condition, which points at a shared cause rather ' +
      'than this device.');
  } else if (peers?.state === CHECK_STATE.PASS) {
    reasons.push(peers.summary);
  }

  if (blockers.length) {
    return { verdict: RMA.CANDIDATE, reasons, blockers };
  }

  // ── RECOMMENDED needs recurrence AND exhausted remediation. ───────────────
  const uptime = byId.get(CHECK.UPTIME);
  const recurring =
    (uptime?.evidence?.unexpectedLast24h ?? 0) >= REBOOT_FAULT_24H
    || deviceFaults.length >= 2;
  if (!recurring) {
    blockers.push('The condition has been seen once. A single occurrence is not a failure pattern; ' +
      'confirm it recurs before recommending replacement.');
    return { verdict: RMA.CANDIDATE, reasons, blockers };
  }

  const attempted = remediation?.attempted ?? [];
  if (attempted.length === 0) {
    blockers.push('No remediation has been attempted. Where a safe action can distinguish hardware ' +
      'from software, take it first.');
    return { verdict: RMA.CANDIDATE, reasons, blockers };
  }
  reasons.push(
    `The condition persisted after ${attempted.join(', ')}, with upstream, configuration and ` +
    'firmware all measured and clean, and comparable APs unaffected.');
  return { verdict: RMA.RECOMMENDED, reasons, blockers: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fleet rollup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Summarise many per-AP assessments into the counts a fleet answer leads with.
 *
 * `unknown` is a first-class bucket and is NEVER folded into healthy. That fold
 * is the specific defect this feature exists to correct: an estate where four
 * APs were assessed and three were unmeasurable read as "all healthy".
 */
export function summariseFleet(assessments = []) {
  const counts = {
    [HEALTH.HEALTHY]: 0,
    [HEALTH.DEGRADED]: 0,
    [HEALTH.UNHEALTHY]: 0,
    [HEALTH.UNKNOWN]: 0,
  };
  const rmaCounts = { [RMA.NONE]: 0, [RMA.CANDIDATE]: 0, [RMA.RECOMMENDED]: 0 };
  for (const a of assessments) {
    if (counts[a.health] !== undefined) counts[a.health] += 1;
    if (rmaCounts[a.rma] !== undefined) rmaCounts[a.rma] += 1;
  }
  return {
    apCount: assessments.length,
    healthy: counts[HEALTH.HEALTHY],
    degraded: counts[HEALTH.DEGRADED],
    unhealthy: counts[HEALTH.UNHEALTHY],
    unknown: counts[HEALTH.UNKNOWN],
    rmaCandidates: rmaCounts[RMA.CANDIDATE],
    rmaRecommended: rmaCounts[RMA.RECOMMENDED],
    instruction:
      'Lead with these counts. "unknown" means insufficient evidence and MUST NOT be reported as ' +
      'healthy or added to the healthy count.',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reboot reconstruction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Turn a stored uptime series into reboot events.
 *
 * A reboot is a DECREASE in uptime between consecutive samples. The Gateway
 * serves no reboot log, so this is the only way the platform can answer "does
 * this AP keep restarting", and it works only over the window AURA has been
 * collecting — which is why the caller must report `windowHours` and why a
 * missing series is `no_history` rather than "no reboots".
 *
 * A reboot whose sample sits within UPGRADE_CORRELATION_WINDOW_S of a firmware
 * string change is an upgrade, not a fault.
 *
 * @param {Array<{at: number, uptimeSeconds: number, firmware?: string|null}>} series
 *        ascending by `at` (epoch ms)
 */
export function reconstructReboots(series = [], { now = Date.now() } = {}) {
  const points = [...series]
    .filter((p) => Number.isFinite(p?.at) && Number.isFinite(p?.uptimeSeconds))
    .sort((a, b) => a.at - b.at);

  if (points.length < 2) {
    return {
      available: false,
      reason: points.length === 0
        ? 'no stored uptime samples for this AP'
        : 'only one stored uptime sample, which cannot show a change',
      reboots: [],
    };
  }

  const reboots = [];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    // Uptime must have gone BACKWARDS. A gap in collection where uptime kept
    // rising is a collector outage, not a reboot, and counting it would invent
    // restarts every time AURA itself was restarted.
    if (cur.uptimeSeconds >= prev.uptimeSeconds) continue;
    const firmwareChanged = Boolean(prev.firmware && cur.firmware && prev.firmware !== cur.firmware);
    reboots.push({
      at: cur.at,
      // The boot instant, as closely as the sample allows.
      bootedAt: cur.at - cur.uptimeSeconds * 1000,
      previousUptimeSeconds: prev.uptimeSeconds,
      firmwareBefore: prev.firmware ?? null,
      firmwareAfter: cur.firmware ?? null,
      upgradeCorrelated: firmwareChanged,
      // There is no reason code for any of these, anywhere in REST.
      reason: null,
    });
  }

  const dayAgo = now - 86_400_000;
  const last24 = reboots.filter((r) => r.at >= dayAgo);
  return {
    available: true,
    windowHours: Math.round((points[points.length - 1].at - points[0].at) / 3_600_000),
    sampleCount: points.length,
    firstSampleAt: points[0].at,
    reboots,
    rebootsLast24h: last24.length,
    upgradeCorrelatedLast24h: last24.filter((r) => r.upgradeCorrelated).length,
    unexpectedLast24h: last24.filter((r) => !r.upgradeCorrelated).length,
    note:
      'Reboots are reconstructed from AURA\'s stored uptime series, not from a Gateway reboot log ' +
      '— none exists. Only the collected window is visible, and no restart carries a reason code.',
  };
}

// ─────────────────────────────────────────────────────────────────────────────

/** Seconds to a short human string. */
export function humanDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

function countBy(list, key) {
  const out = {};
  for (const item of list) {
    const k = String(key(item));
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
