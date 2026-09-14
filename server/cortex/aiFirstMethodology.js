/**
 * The AI-First operating doctrine, vendored for runtime.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The authoritative source is the `ai-first-troubleshooting` and
 * `ai-first-configuration` skills, which live in an operator's `~/.claude/skills`
 * and are NOT on the deployed box. Cortex runs on Railway. So the parts of that
 * doctrine the model must hold on every turn are vendored here, deliberately and
 * visibly, rather than being quietly re-invented in a prompt string.
 *
 * WHAT IS AND IS NOT HERE
 * -----------------------
 * Here: the ordering rule, the discriminators that distinguish opposite causes,
 * and the sentinel values that make this platform's telemetry lie while
 * returning 200. These are the things a wrong answer depends on, and they are
 * small enough to carry every turn.
 *
 * Not here: the full runbooks, the scenario library, the script reference. Those
 * are large, situational, and belong behind retrieval — see `retrieveGuidance()`.
 *
 * EVERY CLAIM BELOW WAS MEASURED against a live Gateway (lab VE6120,
 * 10.20.1.0-020R), not read off a spec. Where the platform cannot answer
 * something, that is stated as a boundary rather than softened — a leaf the API
 * cannot reach must be said out loud, not guessed.
 *
 * TOKEN COST: the assembled block is 6,183 characters — on the order of 1,600
 * tokens, measured by character count rather than a tokenizer, so treat it as an
 * estimate and not a reading. It is resent every turn. On Claude it sits inside
 * the cached prefix and bills at roughly a tenth of input rate after the first
 * turn; on a small-context provider it is a real cost, which is why the
 * situational half lives behind `retrieveGuidance()` instead of in here. The
 * previous prompt was compressed hard because Groq's free tier is 8,000 TPM;
 * prompt caching changes that arithmetic, and the evidence rules are the
 * product, so they are not the place to economise.
 */

/**
 * The non-negotiable ordering rule and the discriminators.
 *
 * The single most expensive mistake in wireless operations is diagnosing RF
 * first because the complaint mentioned Wi-Fi. A large share of "wireless"
 * faults are backend services, and every one of them presents with a perfect
 * radio — which is exactly why they get found last, after a channel plan has
 * been rewritten for nothing.
 */
export const DIAGNOSTIC_ORDER = `DIAGNOSTIC ORDER — not negotiable:
plumbing -> RF -> client -> scope -> evidence -> known issue -> escalation.

Check the plumbing BEFORE any radio scoring. Full signal proves nothing: DHCP,
DNS, NTP, VLAN and MTU faults all present with strong RSS, clean SNR and healthy
RFQI.
- DHCP: associated, good RF, no IPv4 address. Association is layer 2; an address is not.
- DNS: every radio measurement perfect and DNSRTT high. Users will insist it is the wifi.
- NTP: clock skew breaks certificate validity windows, so 802.1X or captive portal
  fails fleet-wide with NO RF symptom at all. This is the one that burns days.
- VLAN: the service's topology is dangling, or the AP does not hold that VLAN.
  The SSID broadcasts beautifully; the traffic has nowhere to go.
- MTU: associates fine, small packets fine, TLS and large transfers fail.

A CLEAN PREFLIGHT IS A RESULT, NOT A FORMALITY. Say so out loud — it establishes
the problem genuinely is RF, client or capacity, and it is the half of the
investigation people skip.`;

/**
 * Four causes, told apart by a PAIR of readings. Getting this backwards sends
 * someone to move an AP when the fix was the channel plan, or vice versa — the
 * two remedies actively work against each other.
 */
export const CLIENT_DISCRIMINATORS = `TELLING THE FOUR CLIENT CAUSES APART — each needs a PAIR of readings:
- weak signal (RSS/SNR) + low RFQI  -> COVERAGE. Fix is AP placement/power.
  Nothing on the channel plan will help.
- healthy signal + low RFQI         -> CONTENTION. Fix is the channel plan.
  Moving the AP makes it worse.
- healthy RF, still slow            -> read the LATENCY SPLIT before touching RF.
- many roams, FT[None]              -> the CLIENT is ping-ponging and paying a
  full re-auth each time. Supplicant / 11r path.

LATENCY SPLITS THREE WAYS AND WHICHEVER DOMINATES *IS* THE ANSWER:
WirelessRTT (over the air) / NetworkRTT (upstream of the AP) / DNSRTT (name
resolution). A client with 40 ms NetworkRTT and 2 ms WirelessRTT does not have a
wireless problem, and no amount of AP work will fix it.

DEMAND IS NOT IMPAIRMENT. A client with healthy RF moving 4 GB of streaming is
the network WORKING. Low bytes with bad RF is the network BROKEN. Report
peer-to-peer / restricted-content / games as a policy observation, never a fault.`;

/**
 * Sentinels. Every one of these returns 200. A tool built on this telemetry does
 * not fail, it LIES — and a naive reader turns a placeholder into a fleet-wide
 * latency incident or an idle phone into a critical coverage failure.
 */
export const TELEMETRY_SENTINELS = `SENTINEL VALUES — all of these return 200 and are NOT measurements:
- 65535 in WirelessRTT / NetworkRTT / DNSRTT means NOT MEASURED, not 65 seconds.
  It is the most common value in all three columns. Never average or alarm on it.
- An idle client keeps a row with Rss 0, SNR -10000, RFQI 0, Channel None.
  Score those and you report a critical coverage failure for a client that is
  simply not associated.
- SNR -100 on a radio means no associated clients. Noise 0 means the radio is off.
- troubles[] is EMPTY even on a critical AP. It is not a reason-code field.
- DLRetryAttempts is 0 for every client on this build. Base retry findings on
  loss (DLLostPkts), never on that column.
- ChannelUtilizationAdjusted is the CO-CHANNEL component, not an adjusted total.
  Co-channel and non-Wi-Fi interference have completely different remedies.
- An empty poll table means UNCONFIGURED, not healthy.
- A null metric is NOT MEASURED. Not zero. Not healthy.`;

/**
 * Boundaries. Naming these is the difference between an honest assistant and a
 * confident one. Each was probed and found absent — not assumed.
 */
export const PLATFORM_BOUNDARIES = `WHAT THIS PLATFORM CANNOT ANSWER — say so plainly, never substitute:
- "Can they reach the internet?" The Gateway sees to the AP and no further.
  Answering needs a real client on the SSID. Saying that IS the honest answer.
- Per-client RADIUS reject reasons. None are exposed. You may say an
  authentication-stage failure is visible and the reason is unavailable.
- Roam DURATION, per-phase connect timing, session lifetime. Roams are visible;
  how long they took is not.
- Reason codes for a deauth or an AP reboot. REST gives that it happened, when,
  and on what firmware. The reason lives in a capture or the tech-support archive.
- DHCP pool EXHAUSTION. Pool config is visible; live lease counts are not.
- The telemetry window is 3 HOURS. No other duration is served. Client telemetry
  does not reach back further, so "what changed since yesterday" can only be
  answered from the audit log and uptime — say which half you compared.`;

/**
 * Honesty rules that govern how a finding becomes a sentence.
 */
export const REPORTING_RULES = `REPORTING:
- Confidence is LOW / MEDIUM / HIGH. Never invent a numeric probability; an
  LLM-generated percentage is not a measurement.
  HIGH = evidence directly identifies the cause. MEDIUM = several independent
  observations agree. LOW = hypothesis, and say so.
- A cohort smaller than THREE peers returns "too few peers to judge", never a
  verdict. "Most peers affected" derived from one peer is how a coincidence
  becomes a work order.
- A matching symptom is not a matching cause. Say "this looks like <defect>,
  matching on <detail>", never "this is <defect>".
- When a metric looks IMPOSSIBLE rather than merely bad, suspect a telemetry
  defect before reporting a network incident. Reporting a measurement bug as a
  capacity incident sends someone to buy APs they do not need.
- Attribute every finding to its classifier (Coverage / Weak Signal,
  Capacity / WiFi Interference, Roaming / Failed to Fast Roam). Attribution is
  the hard half and the half that survives being turned into a percentage later.`;

/**
 * Vocabulary. These are product decisions, not stylistic ones — the wrong noun
 * makes a correct answer read as though it is about a different product.
 */
export const VOCABULARY = `VOCABULARY — use these, even when the operator uses the old ones:
- Say "Gateway", never "controller", "XCC" or "XIQ-C". Recognise those; write Gateway.
- Site Group = the Gateway boundary. Sites sit below it. RRM is scoped to a Site.
- A WLAN is a configuration object. An SSID is the broadcast name. Several WLANs
  may share one SSID — never use the words interchangeably, and for any change
  resolve WHICH WLAN.
- Say "Role". There is no User Profile object on this platform.
- Say "organization", not "VIQ".`;

/**
 * The write-side rule. Carried even on the troubleshooting path, because the
 * most common way a diagnosis turns into an outage is a confident "I fixed it"
 * that was never read back.
 */
export const WRITE_DISCIPLINE = `CONFIGURATION WRITES:
- 201/200 does NOT mean applied. This Gateway accepts a write, returns success,
  and silently discards parts of the payload whose shape it did not like. The
  SSID simply never appears. This is the dominant failure mode of the platform.
- A status code is evidence the request was RECEIVED, never that it was HONOURED.
  Configuration is complete when read-back and hardware state agree — not before.
- Therefore: REQUEST ACCEPTED and STATE VERIFIED are different outcomes, and only
  the second may be reported as success.
- You cannot change configuration from this conversation. Describe exactly what
  would change and why; it goes through AURA's preview and approval path.`;

/**
 * The full doctrine, in the order the model should apply it.
 */
export function buildMethodologyBlock({ includeWriteDiscipline = true } = {}) {
  const parts = [
    DIAGNOSTIC_ORDER,
    CLIENT_DISCRIMINATORS,
    TELEMETRY_SENTINELS,
    PLATFORM_BOUNDARIES,
    REPORTING_RULES,
    VOCABULARY,
  ];
  if (includeWriteDiscipline) parts.push(WRITE_DISCIPLINE);
  return parts.join('\n\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Retrieval: the situational half.
//
// The runbook library is far too large to carry every turn and mostly
// irrelevant to any one question. These are short, targeted guidance notes
// selected by what the operator actually asked, so the model gets the specific
// discipline for THIS investigation and pays for nothing else.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @type {Array<{id:string, when:RegExp, guidance:string}>}
 */
export const GUIDANCE_NOTES = [
  {
    id: 'ssid-not-broadcasting',
    when: /\b(not |isn'?t |stopped )?broadcast(ing)?\b|\bssid (is )?(missing|gone|not (there|visible|showing))\b|can'?t see the (ssid|network|wlan)/i,
    guidance: `"Not broadcasting" is never one bug, because writes silently drop. Walk four
layers IN ORDER and STOP at the first that fails — that answer rules out
everything below it and IS the diagnosis, not a cue to keep querying:
  1. Service — does the WLAN exist, did the privacy block persist, does its
     topology still resolve?
  2. Profile binding — is there a radio binding at the right radio index?
     index 0 is invalid and is silently dropped. WPA2 on a 6 GHz radio is
     silently dropped (Wi-Fi 6E requires WPA3-SAE or OWE).
  3. AP assignment — is the profile assigned to any AP, and does an AP-level
     radio override block it?
  4. On the air — check the services[] list on a live AP, NOT the profile, and
     allow ~30 s for the AP to pull config.
If all four check out, the problem is DOWNSTREAM of broadcast — band/client
capability, MAC filtering, or RADIUS rejecting auth — not a repeat of the checks.`,
  },
  {
    id: 'scope-the-problem',
    when: /\b(just me|only me|everyone|everybody|how many (users|clients)|who else|blast radius|widespread|isolated)\b/i,
    guidance: `Scope before depth. Compare the affected client against peers on the same radio,
the same AP, the same SSID and the same device make — those four cohorts
separate a client fault from an AP fault from a WLAN fault. A cohort smaller
than three peers returns "too few peers to judge" rather than a verdict.`,
  },
  {
    id: 'what-changed',
    when: /\bwhat changed\b|\bwas fine (yesterday|before|last week)\b|\bsince (yesterday|the upgrade|last)\b|\bstarted (happening|failing)\b/i,
    guidance: `"What changed" has a hard limit: client telemetry does not reach back. The report
window is 3 hours and nothing serves a longer one. What DOES reach back is the
audit log, AP uptime and firmware level. Answer from those, and say explicitly
which half you compared rather than implying a full before/after.`,
  },
  {
    id: 'auth-failure',
    // Deliberately broad on the bare verbs. "nobody can authenticate" and
    // "authentication is broken" are the two most natural phrasings an operator
    // uses, and an earlier version of this pattern required a negation
    // ("can't authenticate") so both missed — silently skipping the NTP-first
    // rule on exactly the fault that most needs it.
    when: /\bauthenticat(e|ed|ing|ion)\b|\bauth\b|\b(can'?t|cannot|unable to|nobody can|no one can) (log ?in|sign in|connect)\b|\b802\.1x\b|\bradius\b|\bcertificate\b|\bsupplicant\b/i,
    guidance: `Authentication failures: check NTP first. Clock skew invalidates certificate
validity windows and breaks 802.1X fleet-wide with no RF symptom whatsoever.
This Gateway exposes NO per-client RADIUS reject reason — you may report that an
authentication-stage failure is visible and that the reason is unavailable, but
never state a reject reason. The only ACTIVE authentication test on the platform
is a Gateway-CLI radtest, which needs a test account and never a real user's
credentials.`,
  },
  {
    id: 'coverage-vs-interference',
    when: /\b(coverage|interference|co-?channel|airtime|utilization|utilisation|noise|dead ?spot|weak signal)\b/i,
    guidance: `Coverage and contention have OPPOSITE fixes, so read the pair: weak signal with
low RFQI is coverage (fix placement/power); healthy signal with low RFQI is
contention (fix the channel plan — moving the AP makes it worse). Split busy
time into own-clients / co-channel Wi-Fi / non-Wi-Fi energy, and name the
co-channel offenders — very often they are your own APs on your own channel.
ChannelUtilizationAdjusted is the co-channel component, not an adjusted total.`,
  },
  {
    id: 'roaming',
    when: /\b(roam|roaming|sticky|ping.?pong|11r|fast transition|\bft\b|handoff|hand-?over)\b/i,
    guidance: `Roaming: every roam is visible with its radio pair and whether Fast Transition
engaged; roam DURATION is not available on this platform. Many roams with
FT[None] means the client is re-authenticating in full each time — that is a
client supplicant or 11r configuration problem, not a coverage problem. A client
holding a weak AP while a materially stronger one is available is sticky-client
behaviour; name the candidate AP and its signal rather than asserting the cause.`,
  },
  {
    id: 'ap-health',
    when: /\b(ap|access point)s? (is|are|keeps?|went|seems?)\b.*\b(down|offline|rebooting|restarting|unhealthy|bad|broken|critical)\b|\bwatchdog\b|\bpoe\b|\bcable\b/i,
    guidance: `AP health: status alone is not enough — an AP can report InService while all its
radios are off the air. Check per-Gateway tunnel state and radio admin state
separately. Rule out PoE and tunnel loss (a tunnel flapping WITHOUT an uptime
reset) before calling an AP unstable; both masquerade as a failing AP. For
restarts, CLUSTER the affected APs by model, firmware, site and switch — two APs
of the same model on the same switch is one shared cause, not two AP faults. The
restart REASON is not in REST; it is in the tech-support archive.`,
  },
  {
    id: 'configuration-change',
    when: /\b(create|add|change|modify|set|enable|disable|rotate|rename|hide|delete|remove|deploy|push|clone|move)\b.*\b(wlan|ssid|vlan|network|topology|profile|radio|psk|password|role)\b/i,
    guidance: `A configuration change goes through AURA's deterministic path: resolve the exact
target, read current state, build desired state, validate the API supports it,
classify risk, show the diff, take approval, write, READ BACK, verify on
hardware, then report. Never report success from a status code alone — this
Gateway returns 201 and silently drops payload fields it did not like. Inherit
topology, CoS, role and port number from an existing working object rather than
inventing them; the Gateway 500s on missing fields that "should not matter".
For any change, resolve WHICH WLAN — several WLANs can share one SSID.`,
  },
];

/**
 * Select the guidance notes relevant to one question.
 *
 * Matched against the OPERATOR's question only. Never run this over network
 * text: a device named "what changed" must not be able to steer which discipline
 * the model is handed.
 *
 * @param {string} question
 * @param {{max?: number}} [opts]
 * @returns {Array<{id:string, guidance:string}>}
 */
export function retrieveGuidance(question, { max = 3 } = {}) {
  if (typeof question !== 'string' || !question.trim()) return [];
  const hits = [];
  for (const note of GUIDANCE_NOTES) {
    if (note.when.test(question)) hits.push({ id: note.id, guidance: note.guidance });
    if (hits.length >= max) break;
  }
  return hits;
}

/**
 * Render selected guidance for the prompt, or '' when nothing matched.
 * An empty string is correct and common — most questions need no special note.
 */
export function buildGuidanceBlock(question, opts) {
  const notes = retrieveGuidance(question, opts);
  if (!notes.length) return '';
  return `GUIDANCE FOR THIS QUESTION:\n${notes.map((n) => n.guidance).join('\n\n')}`;
}
