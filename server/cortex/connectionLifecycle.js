/**
 * The client connection lifecycle, as far as this Gateway can actually see it.
 *
 * The single most useful thing a wireless diagnosis can say is "everything up
 * to stage N worked, and stage N+1 is where it broke" — that names a failure
 * domain instead of offering generic advice. This module builds that ladder
 * from real evidence and, critically, marks the rungs it cannot see.
 *
 * EVERY STAGE CARRIES ITS EPISTEMIC STATUS. That is the whole point:
 *
 *   'observed'  a specific field or event says so
 *   'inferred'  a conclusion drawn from 2+ observations, stated as such
 *   'unknown'   no evidence source exists on this platform — say so, never fill it
 *
 * A stage marked 'unknown' must never be rendered as a tick or a cross. The
 * failure mode this prevents is the one that matters: "RADIUS rejected the
 * client" when nothing ever queried RADIUS.
 */

import { rtt, signal, parseFastTransition } from './gatewayEvidence.js';

/**
 * @typedef {'pass'|'fail'|'unknown'|'not_reached'} StageStatus
 * @typedef {'observed'|'inferred'|'unknown'} Epistemics
 * @typedef {{ id: string, label: string, status: StageStatus, basis: Epistemics,
 *             evidence: string[], note?: string }} Stage
 */

/** The ladder, in the order a client actually climbs it. */
export const STAGE_ORDER = [
  'discovery',
  'dot11_auth',
  'association',
  'security_negotiation',
  'client_authentication',
  'aaa_radius',
  'role_assignment',
  'vlan_assignment',
  'dhcp',
  'dns',
  'gateway_reachability',
  'application_reachability',
  'rf_quality',
  'roaming',
  'session_stability',
];

const LABELS = {
  discovery: 'Client discovery (probe/beacon)',
  dot11_auth: '802.11 authentication',
  association: 'Association',
  security_negotiation: 'WPA2/WPA3 security negotiation',
  client_authentication: '802.1X / PPSK / PSK authentication',
  aaa_radius: 'AAA / RADIUS decision',
  role_assignment: 'Role assignment',
  vlan_assignment: 'VLAN assignment',
  dhcp: 'DHCP address acquisition',
  dns: 'DNS resolution',
  gateway_reachability: 'Default-gateway reachability',
  application_reachability: 'Application reachability',
  rf_quality: 'Ongoing RF quality',
  roaming: 'Roaming',
  session_stability: 'Session stability',
};

function stage(id, status, basis, evidence = [], note) {
  return { id, label: LABELS[id] ?? id, status, basis, evidence, ...(note ? { note } : {}) };
}

/**
 * Derive the security mode from a service's privacy block. Returns the shape
 * the Gateway actually uses (WpaPskElement, WpaSaeElement, OweElement,
 * Wpa3Enterprise192bElement) mapped to something an operator recognises.
 */
export function describeSecurity(service) {
  const privacy = service?.privacy ?? {};
  const keys = Object.keys(privacy);
  if (!keys.length) {
    // Measured: captive-portal services carry an empty privacy block.
    return { mode: 'Open / captive portal', key: null, requiresRadius: false };
  }
  const key = keys[0];
  const map = {
    WpaPskElement: { mode: 'WPA2-PSK', requiresRadius: false },
    WpaSaeElement: { mode: 'WPA3-SAE', requiresRadius: false },
    OweElement: { mode: 'OWE (enhanced open)', requiresRadius: false },
    Wpa3Enterprise192bElement: { mode: 'WPA3-Enterprise 192-bit', requiresRadius: true },
    WpaEnterpriseElement: { mode: 'WPA2-Enterprise (802.1X)', requiresRadius: true },
  };
  return { key, ...(map[key] ?? { mode: key, requiresRadius: false }) };
}

/**
 * Build the lifecycle ladder for one client.
 *
 * @param {object} input
 * @param {object|null} input.row        newest MuTable row for the client (null if absent)
 * @param {object[]} input.events        muEvent timeline (chronological)
 * @param {object|null} input.service    the WLAN service record, if resolved
 * @param {object|null} input.topology   the topology the service points at, if resolved
 * @param {import('./capabilityRegistry.js').CapabilityRegistry} input.capabilities
 * @returns {{stages: Stage[], lastSuccessful: Stage|null, firstFailing: Stage|null,
 *            failureDomain: string|null, unknowns: string[]}}
 */
export function buildLifecycle({ row, events = [], service = null, topology = null, capabilities }) {
  const stages = [];
  const cap = (k) => capabilities?.get?.(k) ?? { availability: 'unavailable' };
  const usable = (k) => capabilities?.isUsable?.(k) ?? false;

  const associated = Boolean(row);
  const { rss, snr } = row ? signal(row) : { rss: null, snr: null };
  const hasRf = rss !== null && snr !== null;

  const assocEvents = events.filter((e) => e.type === 'Association');
  const authProblems = events.filter((e) => e.type === 'Auth Problem');
  const roamEvents = events.filter((e) => e.type === 'Roaming');
  const disassocEvents = events.filter((e) => e.type === 'Disassociation');

  // ── 1. Discovery ──────────────────────────────────────────────────────
  // Nothing on the platform reports probe requests. If the client got as far
  // as associating, discovery necessarily happened — that is an inference.
  if (associated || assocEvents.length) {
    stages.push(
      stage('discovery', 'pass', 'inferred', ['The client associated, so it discovered the SSID'],
        'No probe-request telemetry exists on this Gateway; this is deduced from a later stage.')
    );
  } else {
    stages.push(
      stage('discovery', 'unknown', 'unknown', [],
        'The Gateway does not report probe requests, so a client that never associated is invisible here.')
    );
  }

  // ── 2. 802.11 authentication ──────────────────────────────────────────
  // Not separable from association in this telemetry. Say so.
  stages.push(
    stage('dot11_auth', associated || assocEvents.length ? 'pass' : 'unknown',
      associated || assocEvents.length ? 'inferred' : 'unknown',
      associated || assocEvents.length ? ['Implied by a successful Association event'] : [],
      'This Gateway does not report 802.11 open-auth separately from association.')
  );

  // ── 3. Association ────────────────────────────────────────────────────
  if (assocEvents.length) {
    const last = assocEvents[assocEvents.length - 1];
    stages.push(
      stage('association', 'pass', 'observed', [
        `Association event at ${iso(last.timestamp)} to ${last.apName ?? 'an AP'}` +
          (last.ssid ? ` on ${last.ssid}` : ''),
        ...(last.fastTransition ? [`FT[${last.fastTransition}]`] : []),
      ])
    );
  } else if (associated) {
    stages.push(
      stage('association', 'pass', 'observed', [
        `Client is present in current telemetry on ${row.ApName} radio ${row.RadioID}` +
          (row.SSID ? ` / ${row.SSID}` : ''),
      ])
    );
  } else {
    stages.push(
      stage('association', 'fail', 'observed', [
        'No association event in the window and the client is absent from current telemetry',
      ])
    );
  }

  const associationOk = stages.at(-1).status === 'pass';

  // ── 4. Security negotiation ───────────────────────────────────────────
  const sec = service ? describeSecurity(service) : null;
  if (!associationOk) {
    stages.push(stage('security_negotiation', 'not_reached', 'inferred', []));
  } else if (sec) {
    // A client that is associated AND carrying traffic completed the handshake.
    // We cannot see the handshake itself, so this is inferred, not observed.
    stages.push(
      stage('security_negotiation', 'pass', 'inferred', [
        `WLAN ${service.ssid ?? ''} is configured for ${sec.mode}`,
        'The client is associated and passing frames, which requires a completed key exchange',
      ], 'The Gateway does not expose the 4-way handshake or SAE exchange itself.')
    );
  } else {
    stages.push(
      stage('security_negotiation', 'unknown', 'unknown', [],
        'The WLAN configuration for this client was not resolved, so the expected security mode is unknown.')
    );
  }

  // ── 5. Client authentication ──────────────────────────────────────────
  if (!associationOk) {
    stages.push(stage('client_authentication', 'not_reached', 'inferred', []));
  } else if (authProblems.length) {
    const last = authProblems[authProblems.length - 1];
    stages.push(
      stage('client_authentication', 'fail', 'observed', [
        `"Auth Problem" event at ${iso(last.timestamp)}` +
          (last.apName ? ` on ${last.apName}` : ''),
        ...(last.details ? [`Details: ${last.details}`] : []),
        `${authProblems.length} auth problem event(s) in the window`,
      ])
    );
  } else if (row?.RoleName) {
    stages.push(
      stage('client_authentication', 'pass', 'inferred', [
        `No "Auth Problem" events in the window`,
        `The client holds role "${row.RoleName}", which is only applied after authentication`,
      ])
    );
  } else {
    stages.push(
      stage('client_authentication', 'unknown', 'unknown', [],
        'No auth-problem events and no role assignment to infer success from.')
    );
  }

  const authOk = stages.at(-1).status === 'pass';

  // ── 6. AAA / RADIUS ───────────────────────────────────────────────────
  // This is the stage most likely to be hallucinated. There is no per-client
  // RADIUS decision or reject reason in REST on this build. Be explicit.
  if (sec && !sec.requiresRadius) {
    stages.push(
      stage('aaa_radius', 'not_reached', 'observed', [
        `${sec.mode} does not involve a RADIUS exchange for this client`,
      ])
    );
  } else if (!usable('client.radius_reject_reason')) {
    stages.push(
      stage('aaa_radius', 'unknown', 'unknown', [],
        capabilities?.explainGap?.('client.radius_reject_reason') ??
          'No per-client RADIUS decision is exposed by this Gateway.')
    );
  } else {
    stages.push(stage('aaa_radius', 'unknown', 'unknown', []));
  }

  // ── 7. Role assignment ────────────────────────────────────────────────
  if (!authOk && !row?.RoleName) {
    stages.push(stage('role_assignment', 'not_reached', 'inferred', []));
  } else if (row?.RoleName) {
    stages.push(
      stage('role_assignment', 'pass', 'observed', [
        `Role "${row.RoleName}" applied (${row.RoleUUID ?? 'no uuid'})`,
      ])
    );
  } else {
    stages.push(stage('role_assignment', 'unknown', 'unknown', []));
  }

  // ── 8. VLAN assignment ────────────────────────────────────────────────
  // MuTable has no VLAN column; the VLAN is resolved through the service's
  // topology. A dangling topology reference is a real, silent failure.
  if (topology) {
    stages.push(
      stage('vlan_assignment', 'pass', 'inferred', [
        `WLAN maps to topology "${topology.name}" (VLAN ${topology.vlanid})`,
      ], 'Resolved through the WLAN configuration — client telemetry carries no VLAN field.')
    );
  } else if (service) {
    stages.push(
      stage('vlan_assignment', 'fail', 'observed', [
        `WLAN ${service.ssid ?? ''} references topology ${service.defaultTopology ?? '(none)'} ` +
          'which does not resolve against the Gateway topology list',
      ], 'A dangling topology reference stays configured and passes no traffic.')
    );
  } else {
    stages.push(stage('vlan_assignment', 'unknown', 'unknown', []));
  }

  // ── 9. DHCP ───────────────────────────────────────────────────────────
  // The cleanest backend signal on the platform: associated, measurable RF,
  // and no address. Outcome only — never pool state.
  if (!associated) {
    stages.push(stage('dhcp', 'not_reached', 'inferred', []));
  } else if (row.IP) {
    stages.push(stage('dhcp', 'pass', 'observed', [`Client holds ${row.IP}`]));
  } else if (hasRf) {
    stages.push(
      stage('dhcp', 'fail', 'inferred', [
        `Client is associated to ${row.ApName} with a usable radio (RSS ${rss} dBm, SNR ${snr} dB)`,
        'but carries no IPv4 address',
      ], 'Association is layer 2; an address is not. No per-client DHCP timing or NAK reason ' +
         'is exposed, so the failing step within DHCP cannot be named from here.')
    );
  } else {
    stages.push(
      stage('dhcp', 'unknown', 'unknown', [],
        'No address, but RF is not measurable either, so DHCP cannot be isolated as the cause.')
    );
  }

  // ── 10. DNS ───────────────────────────────────────────────────────────
  const dnsRtt = row ? rtt(row.DNSRTT) : null;
  if (!associated || !row?.IP) {
    stages.push(stage('dns', 'not_reached', 'inferred', []));
  } else if (dnsRtt !== null) {
    stages.push(stage('dns', 'pass', 'observed', [`DNS resolution measured at ${dnsRtt} ms`]));
  } else {
    stages.push(
      stage('dns', 'unknown', 'unknown', [],
        'DNSRTT is unmeasured for this client (the Gateway reports its not-measured sentinel), ' +
        'so DNS health cannot be judged from telemetry.')
    );
  }

  // ── 11/12. Reachability — genuinely absent ────────────────────────────
  for (const id of ['gateway_reachability', 'application_reachability']) {
    stages.push(
      stage(id, 'unknown', 'unknown', [],
        'Nothing on this Gateway tests reachability past itself. This needs a real client ' +
        'on the SSID (or a probe host) to answer.')
    );
  }

  // ── 13. RF quality ────────────────────────────────────────────────────
  if (!associated) {
    stages.push(stage('rf_quality', 'not_reached', 'inferred', []));
  } else if (hasRf) {
    const rfqi = Number(row.RFQI);
    const ok = rss >= -72 && snr >= 20 && (!Number.isFinite(rfqi) || rfqi >= 3);
    stages.push(
      stage('rf_quality', ok ? 'pass' : 'fail', 'observed', [
        `RSS ${rss} dBm, SNR ${snr} dB` + (Number.isFinite(rfqi) ? `, RFQI ${rfqi}/5` : ''),
        ...(row.Channel ? [`channel ${row.Channel} (${row['11Protocol'] ?? '?'})`] : []),
      ])
    );
  } else {
    stages.push(stage('rf_quality', 'unknown', 'unknown', []));
  }

  // ── 14. Roaming ───────────────────────────────────────────────────────
  if (roamEvents.length === 0) {
    stages.push(
      stage('roaming', 'pass', 'observed', ['No roam events in the window'])
    );
  } else {
    const noFt = roamEvents.filter((e) => parseFastTransition(e.details) === 'None').length;
    // Rate, not raw count. muEvent was measured returning events spanning DAYS
    // even though the report duration is 3H, so a bare count silently compares
    // a multi-day total against a three-hour expectation and cries wolf.
    const rate = roamRatePerHour(roamEvents);
    // Sustained double-digit roams per hour is thrash; a handful is mobility.
    const excessive = rate !== null && rate >= 10;
    const spanHours = roamSpanHours(roamEvents);
    stages.push(
      stage('roaming', excessive ? 'fail' : 'pass', 'observed', [
        `${roamEvents.length} roam event(s)` +
          (spanHours !== null ? ` over ${spanHours.toFixed(1)} h of history` : ''),
        ...(rate !== null ? [`${rate.toFixed(1)} roams/hour`] : []),
        ...(noFt ? [`${noFt} of them reported FT[None] — no fast transition, so each cost a full re-auth`] : []),
      ], 'Roam *duration* is not reported by this Gateway, so slowness of an individual roam ' +
         'cannot be measured — only whether fast transition engaged.')
    );
  }

  // ── 15. Session stability ─────────────────────────────────────────────
  const loss = row ? lossRatio(row) : null;
  if (!associated) {
    stages.push(stage('session_stability', 'not_reached', 'inferred', []));
  } else {
    const ev = [];
    if (disassocEvents.length) ev.push(`${disassocEvents.length} disassociation event(s)`);
    if (loss !== null) ev.push(`downlink loss ${(loss * 100).toFixed(2)}%`);
    const bad = (loss !== null && loss > 0.02) || disassocEvents.length > 5;
    stages.push(
      stage('session_stability', bad ? 'fail' : 'pass', 'observed',
        ev.length ? ev : ['No disassociations and no measurable downlink loss'],
        'Session lifetime is not recorded, so "how often does a session die" is reconstructed ' +
        'from events rather than measured.')
    );
  }

  // ── verdict ───────────────────────────────────────────────────────────
  const ordered = STAGE_ORDER.map((id) => stages.find((s) => s.id === id)).filter(Boolean);
  const firstFailing = ordered.find((s) => s.status === 'fail') ?? null;
  const passesBeforeFailure = [];
  for (const s of ordered) {
    if (s.status === 'fail') break;
    if (s.status === 'pass') passesBeforeFailure.push(s);
  }
  const lastSuccessful = passesBeforeFailure.at(-1) ?? null;
  const unknowns = ordered.filter((s) => s.status === 'unknown').map((s) => s.id);

  return {
    stages: ordered,
    lastSuccessful,
    firstFailing,
    failureDomain: firstFailing ? failureDomainFor(firstFailing.id) : null,
    unknowns,
  };
}

function failureDomainFor(stageId) {
  const domains = {
    association: 'RF / client capability / WLAN availability',
    security_negotiation: 'WLAN security configuration or client security capability',
    client_authentication: 'Authentication (credentials, PPSK identity, or 802.1X exchange)',
    aaa_radius: 'AAA / RADIUS',
    role_assignment: 'Role / policy configuration',
    vlan_assignment: 'VLAN / topology configuration',
    dhcp: 'DHCP / VLAN path',
    dns: 'DNS resolution',
    rf_quality: 'RF — coverage or contention',
    roaming: 'Roaming behaviour / AP placement / fast-transition configuration',
    session_stability: 'Stability — loss or repeated disassociation',
  };
  return domains[stageId] ?? null;
}

/**
 * Observed span of an event list, in hours. muEvent returns whatever history
 * the Gateway holds — measured at several days — so the span has to be read
 * from the events themselves rather than assumed from the report duration.
 */
export function roamSpanHours(events) {
  const ts = events.map((e) => Number(e.timestamp)).filter((n) => Number.isFinite(n) && n > 0);
  if (ts.length < 2) return null;
  const span = Math.max(...ts) - Math.min(...ts);
  if (span <= 0) return null;
  return span / 3_600_000;
}

/** Roams per hour over the observed span. null when the span is unknowable. */
export function roamRatePerHour(events) {
  const span = roamSpanHours(events);
  if (span === null) return null;
  // Guard the degenerate case: several events inside a few seconds would
  // otherwise divide by ~0 and report thousands of roams per hour.
  return events.length / Math.max(span, 0.25);
}

function lossRatio(row) {
  const lost = Number(row.DLLostPkts);
  const rx = Number(row.RxPkts);
  if (!Number.isFinite(lost) || !Number.isFinite(rx) || rx <= 0) return null;
  return lost / (rx + lost);
}

function iso(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return 'an unknown time';
  return new Date(n).toISOString();
}

/**
 * Render the ladder the way an operator reads it. Unknown rungs get "?" — never
 * a tick or a cross, because a guess here is the failure this module exists to
 * prevent.
 */
export function renderLifecycle(result) {
  const glyph = { pass: '✓', fail: '✕', unknown: '?', not_reached: '·' };
  const lines = result.stages.map((s) => {
    const basis = s.basis === 'observed' ? '' : ` [${s.basis}]`;
    return `${glyph[s.status] ?? '?'} ${s.label}${basis}`;
  });
  if (result.firstFailing) {
    lines.push('');
    lines.push(`Likely failure domain: ${result.failureDomain}`);
  }
  return lines.join('\n');
}
