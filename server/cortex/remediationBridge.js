/**
 * Diagnosis -> remediation proposal.
 *
 * This is the seam between the two AI-First halves. Troubleshooting owns
 * symptoms through root cause; configuration owns desired state through
 * hardware verification. The handoff between them is where an assistant most
 * easily becomes dangerous, so the rules are explicit:
 *
 * 1. A PROPOSAL IS NOT AN ACTION. Nothing here writes. It produces a structured
 *    description of what would change, which the operator can then approve
 *    through the existing deterministic configuration path.
 *
 * 2. EXECUTABILITY IS STATED, NEVER IMPLIED. Most wireless remediations are not
 *    configuration writes at all — moving an AP, replacing a cable, fixing an
 *    NTP server, changing a supplicant. Presenting those as something Cortex can
 *    "do" is the most misleading thing this module could do, so every proposal
 *    carries an explicit verdict about who can carry it out.
 *
 * 3. ONLY IMPLEMENTED ACTIONS CLAIM TO BE EXECUTABLE. The deterministic write
 *    path implements exactly two actions today (`create_wlan`, `create_vlan`).
 *    Everything else is `manual` or `unsupported` — and an honest
 *    "I understand the change but the API exposes no write for it" is a correct
 *    answer, not a failure.
 */

/**
 * Actions the deterministic configuration pipeline can actually carry out.
 * Kept in sync with IMPLEMENTED_ACTIONS in wirelessIntentParser.js — if that
 * list grows, this one must grow with it, and the tests assert they agree.
 */
export const EXECUTABLE_ACTIONS = new Set(['create_wlan', 'create_vlan']);

/**
 * @typedef {'cortex'|'operator'|'field'|'other-system'|'unsupported'} Owner
 *   cortex        — the deterministic write path can do it, behind approval
 *   operator      — a Gateway change a human makes in AURA; no write path yet
 *   field         — physical work: placement, cabling, power
 *   other-system  — not the Gateway: DHCP, DNS, NTP, RADIUS, the client itself
 *   unsupported   — understood, but no API write exists anywhere
 */

/**
 * The remediation catalogue.
 *
 * Each entry maps a root-cause class to what actually fixes it and who can do
 * it. `signals` are matched against the DIAGNOSIS text produced by the
 * investigation — never against raw network data, which would let a device name
 * steer a remediation proposal.
 */
export const REMEDIATIONS = [
  {
    id: 'dhcp-no-address',
    signals: [/\bDHCP\b/i, /\bno (ipv4 )?address\b/i, /\bnot getting an? (ip|address)\b/i],
    cause: 'Clients associate but receive no IPv4 address.',
    owner: 'other-system',
    action:
      'Check the DHCP scope serving this VLAN: pool exhaustion, a down relay, or the ' +
      'wrong helper address. The Gateway exposes pool configuration but not live lease ' +
      'counts, so exhaustion has to be confirmed on the DHCP server itself.',
    gatewayChange: null,
  },
  {
    id: 'ntp-clock-skew',
    signals: [/\bNTP\b/i, /\bclock skew\b/i, /\btime (is |was )?(wrong|off|out of sync)\b/i],
    cause: 'Clock skew is invalidating certificate validity windows.',
    owner: 'other-system',
    action:
      'Correct time sync on the Gateway and the RADIUS server. This breaks 802.1X and ' +
      'captive portal fleet-wide with no RF symptom at all, so it is worth fixing before ' +
      'any wireless change is considered.',
    gatewayChange: null,
  },
  {
    id: 'dns-slow',
    signals: [/\bDNS\b/i, /\bDNSRTT\b/i, /\bname resolution\b/i],
    cause: 'Name resolution is the dominant latency component.',
    owner: 'other-system',
    action:
      'Investigate the resolver serving these clients. The radio measurements are ' +
      'healthy; no AP or channel change will improve this.',
    gatewayChange: null,
  },
  {
    id: 'coverage-weak-signal',
    signals: [/\bcoverage\b/i, /\bweak signal\b/i, /\bout of range\b/i, /\blow RSS\b/i],
    cause: 'Signal level is below the coverage expectation for this area.',
    owner: 'field',
    action:
      'AP placement or transmit power. Adding capacity on the same channel plan will not ' +
      'help — and raising power alone often widens the co-channel problem instead of ' +
      'fixing the edge.',
    gatewayChange: null,
  },
  {
    id: 'co-channel-contention',
    signals: [/\bco-?channel\b/i, /\bcontention\b/i, /\bchannel (plan|reuse)\b/i, /\bairtime\b/i],
    cause: 'Airtime is being consumed by other Wi-Fi on the same channel.',
    owner: 'operator',
    action:
      'Revisit the channel plan or RRM policy for this Site. Very often the offenders are ' +
      'your own APs on your own channel. Moving the AP makes this worse, not better.',
    gatewayChange: 'RRM / channel plan — no deterministic write path in Cortex today.',
  },
  {
    id: 'non-wifi-interference',
    signals: [/\bnon-?wi-?fi\b/i, /\binterference\b/i, /\bnoise floor\b/i],
    cause: 'Non-Wi-Fi energy is consuming airtime on this channel.',
    owner: 'field',
    action:
      'Locate the emitter, or move the channel away from it. Classifying the source needs ' +
      'a spectrum capture — this Gateway reports the energy, not what is producing it.',
    gatewayChange: null,
  },
  {
    id: 'sticky-client-roaming',
    signals: [/\bsticky\b/i, /\broam(ing)?\b/i, /\bFT\[None\]/i, /\bfast transition\b/i],
    cause: 'The client is holding a weak AP, or re-authenticating fully on every roam.',
    owner: 'operator',
    action:
      'Two different fixes depending on which it is. Full re-auth on every roam points at ' +
      'Fast Transition / 802.11r on the WLAN. A client holding a weak AP while a stronger ' +
      'one is available is supplicant behaviour and is usually fixed on the client.',
    gatewayChange: 'Fast Transition / Mobility Domain on the WLAN — no write path in Cortex today.',
  },
  {
    id: 'vlan-missing-or-dangling',
    signals: [/\bVLAN\b/i, /\btopology\b/i, /\bdangling\b/i],
    cause: 'The WLAN references a topology that does not resolve, or the AP does not hold it.',
    owner: 'cortex',
    action:
      'Create or correct the VLAN/topology and rebind it. The SSID can broadcast perfectly ' +
      'while the traffic has nowhere to go, which is why this presents as a wireless fault.',
    gatewayChange: 'create_vlan',
  },
  {
    id: 'radio-binding-missing',
    signals: [/\bradio (binding|index)\b/i, /\bindex 0\b/i, /\bnot bound\b/i, /\bnot broadcasting\b/i],
    cause: 'The WLAN is not bound to a radio, or was bound at the invalid index 0.',
    owner: 'cortex',
    action:
      'Rebind the service at the real radio index. A binding written at index 0 is accepted ' +
      'and silently dropped, which is the single most common cause of an SSID that never ' +
      'appears.',
    gatewayChange: 'create_wlan',
  },
  {
    id: 'wpa2-on-6ghz',
    signals: [/\bWPA2\b.*\b6\s?GHz\b/i, /\b6\s?GHz\b.*\bWPA2\b/i, /\bWi-?Fi 6E\b/i],
    cause: 'A WPA2 service cannot carry on a 6 GHz radio and is silently dropped.',
    owner: 'cortex',
    action:
      'Switch the WLAN to WPA3-SAE or OWE, pair an OWE companion for legacy clients, or ' +
      'accept 2.4/5 GHz only. The drop is expected behaviour, not a fault — say so rather ' +
      'than retrying the same write.',
    gatewayChange: 'create_wlan',
  },
  {
    id: 'ap-down-or-radios-off',
    signals: [/\bAP (is )?(down|offline)\b/i, /\bradios? (are )?off\b/i, /\btunnel\b/i],
    cause: 'The AP is not serving clients — down, tunnel-disconnected, or radios off the air.',
    owner: 'field',
    action:
      'Check power and the Gateway tunnel before treating this as an AP fault. A tunnel ' +
      'flapping without an uptime reset, and a PoE budget problem, both masquerade as a ' +
      'failing AP.',
    gatewayChange: null,
  },
  {
    id: 'cable-or-poe',
    signals: [/\bcable\b/i, /\bPoE\b/i, /\bduplex\b/i, /\bnegotiat(ed|ion)\b/i, /\blow.?power\b/i],
    cause: 'The AP uplink is negotiating below its capability, or power is constrained.',
    owner: 'field',
    action:
      'Physical-layer remediation: the cable run, the patch, or the switch port. This does ' +
      'not go to the configuration path at all — it goes to whoever owns the wiring.',
    gatewayChange: null,
  },
  {
    id: 'auth-failure',
    signals: [/\bauthenticat/i, /\b802\.1X\b/i, /\bRADIUS\b/i],
    cause: 'Clients are failing at the authentication stage.',
    owner: 'other-system',
    action:
      'Validate the RADIUS path with a test account. This Gateway exposes no per-client ' +
      'reject reason, so the reason has to come from the RADIUS server logs or a capture — ' +
      'check NTP first, because clock skew breaks this fleet-wide with no RF symptom.',
    gatewayChange: null,
  },
];

/**
 * Propose remediation for a diagnosis.
 *
 * @param {object} args
 * @param {string} args.diagnosis  the investigation's own conclusion text
 * @param {Array}  [args.ledger]   the evidence ledger, used to refuse a proposal
 *                                 that rests on nothing
 * @returns {{
 *   proposals: Array<{id:string, cause:string, owner:Owner, action:string,
 *                     executableByCortex:boolean, gatewayChange:string|null}>,
 *   executable: Array<object>,
 *   requiresHuman: Array<object>,
 *   summary: string,
 *   evidenceBacked: boolean
 * }}
 */
export function proposeRemediation({ diagnosis = '', ledger = [] } = {}) {
  const text = String(diagnosis ?? '');
  const evidenceBacked = ledger.some((l) => l.ok);

  const matched = REMEDIATIONS.filter((r) => r.signals.some((re) => re.test(text)));

  const proposals = matched.map((r) => ({
    id: r.id,
    cause: r.cause,
    owner: r.owner,
    action: r.action,
    // Only the two actions the deterministic pipeline actually implements may
    // claim to be executable. Everything else is honest about needing a human.
    executableByCortex: r.owner === 'cortex' && EXECUTABLE_ACTIONS.has(r.gatewayChange),
    gatewayChange: r.gatewayChange,
  }));

  const executable = proposals.filter((p) => p.executableByCortex);
  const requiresHuman = proposals.filter((p) => !p.executableByCortex);

  let summary;
  if (!proposals.length) {
    summary =
      'No remediation in the catalogue matches this diagnosis. That is a real answer: ' +
      'describe the finding and let an engineer decide, rather than proposing a change ' +
      'that does not follow from the evidence.';
  } else if (!evidenceBacked) {
    summary =
      'A remediation pattern matches the wording of this diagnosis, but no tool call ' +
      'succeeded in this investigation. Do not act on it — establish the evidence first.';
  } else if (executable.length) {
    summary =
      `${executable.length} of ${proposals.length} proposed change(s) can go through ` +
      "AURA's deterministic configuration path with preview, approval, read-back and " +
      'on-hardware verification. The rest need a human.';
  } else {
    summary =
      `None of the ${proposals.length} proposed remediation(s) is a configuration write ` +
      'Cortex can make. That is the common case in wireless — the fix is physical, on ' +
      'another system, or in a configuration domain with no write path yet.';
  }

  return {
    proposals,
    executable,
    requiresHuman,
    summary,
    // A proposal built on an empty ledger is a guess wearing a plan's clothes.
    evidenceBacked,
  };
}

/**
 * Render a proposal for the operator.
 *
 * Deliberately plain: the point is that the reader can tell at a glance which
 * items Cortex can carry out and which it cannot.
 */
export function formatRemediation(result) {
  if (!result.proposals.length) return result.summary;

  const lines = [result.summary, ''];
  for (const p of result.proposals) {
    const tag = p.executableByCortex
      ? 'Cortex can do this (with approval)'
      : `Needs: ${p.owner}`;
    lines.push(`- ${p.cause}`);
    lines.push(`  ${p.action}`);
    lines.push(`  [${tag}]`);
    lines.push('');
  }
  if (!result.evidenceBacked) {
    lines.push('WARNING: no successful tool call backs this diagnosis. Do not act on it.');
  }
  return lines.join('\n').trim();
}
