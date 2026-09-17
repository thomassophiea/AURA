/**
 * Deterministic parser for WLAN configuration requests.
 *
 * This is intentionally NOT an LLM call: the product spec requires the parser
 * to "ask for clarification rather than guessing" on scope, security, VLAN,
 * schedule, Role, Profile, or Model Profile — a regex/slot-fill extractor is
 * exhaustively testable and never invents a field it didn't see in the text,
 * which an LLM free-text parse cannot guarantee. The LLM layer (cortexOrchestrator)
 * is used only to narrate the result back to the operator, never to invent intent.
 *
 * Supported actions today: `create_wlan` and `create_vlan`. Other actions in
 * the WirelessConfigurationIntent union are recognized (so the operator gets
 * an honest "not yet supported" message) but do not produce a mutating plan —
 * see the migration matrix's deferred scope and
 * docs/AURA_NETWORK_INTELLIGENCE_CONFIGURATION_ROADMAP.md for build order.
 */

import { detectConfigurationDomain } from './configurationDomainCatalog.js';

const CREATE_VERBS =
  /\b(create|add|make|stand up|set up|deploy|push|build|configure)\b.*\b(wlan|ssid|wifi|wi-fi|wireless network|guest network|network)\b/i;
const DELETE_VERBS = /\b(delete|remove|tear down)\b.*\b(wlan|ssid|network)\b/i;
const UPDATE_VERBS =
  /\b(disable|hide|enable|unhide|show|update|change|rename|rotate)\b.*\b(wlan|ssid|network|password|psk)\b/i;
const ASSIGN_VERBS = /\bdeploy\b.*\bto\b|\bassign\b.*\b(profile|ap)\b/i;
const SCHEDULE_VERBS = /\bschedule\b.*\b(wlan|ssid|network)\b/i;

// Same trigger CONFIGURATION_DOMAINS uses for the 'vlan' domain (id 9 in the
// Ascend IQC catalog) — single source of truth, so a phrase this parser now
// implements can never also come back "unimplemented" from the fallback path
// below. Deliberately excludes "wlan/ssid/wifi/network" as the create object,
// so "create a network on VLAN 40" (a WLAN request) is never mis-caught here.
const CREATE_VLAN_VERBS =
  /\b(create|add|new|define|configure|stand up|set up)\b(?![^.]*\b(wlan|ssid|wifi|wi-fi|network)\b)[^.]*\b(vlan|topology|topologies)\b/i;

const READ_ONLY_LEAD =
  /^\s*(what|which|is|are|how many|who|where|show|list|does|do|can|explain|why)\b/i;

// Words that can trail a captured site name when the operator ran the site
// straight into a security/VLAN clause with no punctuation between them.
const SITE_TRAILING_NOISE =
  /\s+(wpa2|wpa3|psk|sae|owe|open|enterprise|vlan|wlan|ssid|password|passphrase)\b.*$/i;

const SECURITY_PATTERNS = [
  { re: /wpa3[\s-]*enterprise|wpa3\s*enterprise/i, mode: 'wpa3_enterprise' },
  { re: /wpa2[\s-]*enterprise|wpa2\s*enterprise|enterprise.*wpa2/i, mode: 'wpa2_enterprise' },
  { re: /wpa3|sae\b/i, mode: 'wpa3_personal' },
  { re: /\bowe\b|enhanced open/i, mode: 'owe' },
  { re: /\bopen\b(?!.*roaming)|no security|no password|no passphrase/i, mode: 'open' },
  { re: /wpa2|psk\b|pre-?shared key/i, mode: 'wpa2_personal' },
];

const SUPPORTED_ACTIONS = new Set([
  'create_wlan',
  'modify_wlan',
  'update_wlan',
  'delete_wlan',
  'assign_wlan',
  'schedule_wlan',
  'create_vlan',
  'validate_only',
]);

const IMPLEMENTED_ACTIONS = new Set(['create_wlan', 'create_vlan', 'validate_only']);

// The 30 non-WLAN configuration domains from the Ascend IQC Skills Catalog
// audit — recognized honestly (name + real Local API it would use), never
// silently built into a WLAN intent and never silently dropped into generic
// chat. See docs/AURA_NETWORK_INTELLIGENCE_CONFIGURATION_ROADMAP.md.

function extractQuoted(input) {
  const matches = input.match(/["“]([^"”]{1,32})["”]/g) ?? [];
  return matches.map((m) => m.replace(/["“”]/g, '').trim()).filter(Boolean);
}

/**
 * Words that end a name rather than belong to one.
 *
 * A WLAN name contains no preposition and no relative pronoun, so the first one
 * encountered ends the capture. Without this the character class — which allows
 * spaces, for "Guest WiFi" — ran straight on into the rest of the sentence:
 *
 *   "add a guest network that's owe to primary site"  -> name "that"
 *   "add a guest network to primary site"             -> name "to primary site"
 *   "create a wlan called Lobby at PrimarySite"       -> name "Lobby at PrimarySite"
 *
 * All three shipped, and the first is what an operator saw in the plan preview:
 * WLAN name "that", SSID "that".
 */
const NAME_STOPWORDS = new Set([
  'that', 'which', 'this', 'these', 'those', 'it', 'its',
  'to', 'at', 'for', 'in', 'on', 'with', 'from', 'by', 'of', 'and', 'or',
  'the', 'a', 'an', 'using', 'via', 'please', 'called', 'named',
]);

/**
 * Keep the leading run of name-ish tokens; reject what is left if it names
 * nothing.
 *
 * Returning null is the right outcome for "add a guest network" — the operator
 * did not supply a name, `wlanName` joins `missingFields`, and the flow asks.
 * Inferring "guest" would be inventing a name for an object about to be
 * created, which is worse than asking.
 */
function cleanWlanName(raw) {
  const kept = [];
  for (const token of String(raw ?? '').trim().split(/\s+/).filter(Boolean)) {
    if (NAME_STOPWORDS.has(token.toLowerCase())) break;
    kept.push(token);
  }
  const name = kept.join(' ').trim();
  return name.length >= 2 ? name : null;
}

function extractNamedField(input, keywords) {
  // "called Guest", "named Guest-WiFi", "the Guest network"
  const re = new RegExp(`(?:${keywords.join('|')})\\s+(?:called|named)?\\s*["“]?([A-Za-z0-9][A-Za-z0-9 _-]{0,31})["”]?`, 'i');
  const m = input.match(re);
  return m ? cleanWlanName(m[1]) : null;
}

function extractVlan(input) {
  const m = input.match(/vlan\s*(?:id)?\s*#?\s*(\d{1,4})\b/i);
  if (!m) return null;
  const id = parseInt(m[1], 10);
  return Number.isInteger(id) && id >= 1 && id <= 4094 ? id : null;
}

function extractSite(input) {
  // "at Boston Office", "at the Boston site", "for Site Alpha"
  // Two forms, and "to" belongs in both: "add a guest network TO primary site"
  // is how operators phrase it, and omitting the preposition meant the site was
  // never extracted at all — the plan preview then showed no site while the
  // operator had named one in the sentence.
  //
  // A capitalised name is taken on its own ("at Boston Office"). A lowercase one
  // is taken ONLY when the word "site" follows it ("to primary site"), because
  // without that anchor "for the guest network" would yield a site called
  // "guest network".
  const m =
    input.match(/\b(?:at|for|in|to)\s+(?:the\s+)?([A-Z][A-Za-z0-9][\w'&-]*(?:\s+[A-Z][\w'&-]*){0,3})(?:\s+site)?\b/) ??
    input.match(/\b(?:at|for|in|to)\s+(?:the\s+)?([A-Za-z][\w'&-]*(?:\s+[A-Za-z][\w'&-]*){0,2})\s+site\b/i);
  if (!m) return null;
  return m[1]
    .replace(SITE_TRAILING_NOISE, '') // strip a security/VLAN clause the operator ran on with no separator
    .replace(/\s+site$/i, '')
    .trim() || null;
}

function extractPassword(input) {
  // "password 12345678", "passphrase is 'guestwifi'", "PSK: hunter2"
  const m = input.match(/\b(?:password|passphrase|psk)\b\s*(?:is|:)?\s*["“]?([^\s"”]{4,63})["”]?/i);
  return m ? m[1] : null;
}

function extractSecurity(input) {
  for (const { re, mode } of SECURITY_PATTERNS) {
    if (re.test(input)) return mode;
  }
  return null;
}

function extractTopologyName(input) {
  const quoted = extractQuoted(input);
  if (quoted[0]) return quoted[0];
  const m = input.match(/\b(?:vlan|topology)\s+(?:called|named)\s+["“]?([A-Za-z0-9][A-Za-z0-9 _-]{0,31})["”]?/i);
  return m ? m[1].trim() : null;
}

const MODE_PATTERNS = [
  { re: /bridg(?:ed|e)\s*(?:traffic\s*)?(?:locally\s*)?at\s*(?:the\s*)?ac\b|centrali[sz]ed/i, mode: 'BridgedAtAc' },
  { re: /rout(?:ed|e)\s*at\s*(?:the\s*)?(?:ac|hwc)\b/i, mode: 'RoutedAtAc' },
  { re: /bridg(?:ed|e)\s*(?:traffic\s*)?(?:locally\s*)?at\s*(?:the\s*)?ap\b|local(?:ly)?\s*(?:bridged|switched)/i, mode: 'BridgedAtAp' },
];

function extractTopologyMode(input) {
  for (const { re, mode } of MODE_PATTERNS) {
    if (re.test(input)) return mode;
  }
  return null; // let the provisioning engine default to BridgedAtAp / mirror the template
}

function extractTagged(input) {
  if (/\buntagged\b|\bnative\b/i.test(input)) return false;
  if (/\btagged\b/i.test(input)) return true;
  return null; // default applied downstream (true) — not a missing field, just unspecified
}

// Single source of truth for "which mutating action is this" — classify()
// delegates here rather than keeping a separate, easy-to-desync verb check.
/**
 * Phrases that name a catalogued change.
 *
 * Deliberately a fixed map rather than fuzzy matching. A setting Cortex cannot
 * change must fall through untouched — approximating "fast transition" to the
 * nearest field it CAN write would be worse than declining, because the
 * operator would get a confident change to something they did not ask for.
 */
const MODIFY_PHRASES = [
  [/\b(802\.?11k|11k|neighbou?r reports?)\b/i, 'wlan.11k'],
  [/\bbeacon reports?\b/i, 'wlan.11k.beaconReport'],
  [/\bquiet ie\b/i, 'wlan.11k.quietIe'],
  [/\bmbo\b|\bagile multiband\b/i, 'wlan.mbo'],
  [/\bclient[- ]?to[- ]?client\b/i, 'wlan.clientToClient'],
  [/\bu-?apsd\b|\bpower ?save\b/i, 'wlan.uapsd'],
  [/\b(hide|unhide|suppress)\b.*\bssid\b|\bssid suppress/i, 'wlan.suppressSsid'],
  [/\bpre-?auth\w*\s+idle timeout\b/i, 'wlan.idleTimeout.preAuth'],
  [/\bpost-?auth\w*\s+idle timeout\b/i, 'wlan.idleTimeout.postAuth'],
];

// `hide` turns SUPPRESSION on, which is why it sits with the enabling verbs.
// `show` is deliberately absent from the off list: "show the ssid on Skynet"
// is far more likely to be a question than an instruction, and guessing wrong
// there changes a network.
const MODIFY_ON = /\b(enable|enabled|turn on|switch on|activate|hide)\b/i;
const MODIFY_OFF = /\b(disable|disabled|turn off|switch off|deactivate|unhide)\b/i;
const MODIFY_SET = /\bset\b[\s\S]*\bto\s+(\d+)\b/i;

/** The WLAN is the LAST "on <name>" — the first one often belongs to a phrasal
 *  verb ("turn on mbo on Skynet"). */
function lastNamedWlan(input) {
  const matches = [...input.matchAll(/\bon\s+([A-Za-z0-9_][A-Za-z0-9_\-]*)/gi)];
  return matches.length ? matches[matches.length - 1][1] : null;
}

/**
 * A change to an existing WLAN, drawn only from the catalogue.
 *
 * Runs BEFORE detectAction so that a catalogued change beats the generic
 * update_wlan path: "hide the ssid on Skynet" matches both, and the catalogued
 * reading is the one that can be previewed, applied and verified.
 */
function parseModifyIntent(trimmed, meta) {
  const hit = MODIFY_PHRASES.find(([re]) => re.test(trimmed));
  if (!hit) return null;

  const wlanName = lastNamedWlan(trimmed);
  if (!wlanName) return null;

  const numeric = trimmed.match(MODIFY_SET);
  const on = MODIFY_ON.test(trimmed);
  const off = MODIFY_OFF.test(trimmed);

  let desired;
  if (numeric) desired = Number(numeric[1]);
  else if (on && !off) desired = true;
  else if (off && !on) desired = false;
  // Ambiguous or absent direction falls through to the parser's safe default
  // rather than picking one.
  else return null;

  return {
    intent: {
      action: 'modify_wlan',
      wlanName,
      changeId: hit[1],
      desired,
      requestedBy: meta.requestedBy ?? 'unknown',
      source: meta.source ?? 'text',
      rawInstruction: trimmed,
    },
    missingFields: [],
    ambiguities: [],
    riskLevel: 'low',
    humanReadable: `Change ${hit[1]} on ${wlanName} to ${JSON.stringify(desired)}.`,
    classification: 'mutating',
  };
}

function detectAction(input) {
  if (DELETE_VERBS.test(input)) return 'delete_wlan';
  if (UPDATE_VERBS.test(input)) return 'update_wlan';
  if (ASSIGN_VERBS.test(input)) return 'assign_wlan';
  if (SCHEDULE_VERBS.test(input)) return 'schedule_wlan';
  if (CREATE_VLAN_VERBS.test(input)) return 'create_vlan';
  if (CREATE_VERBS.test(input)) return 'create_wlan';
  return 'validate_only';
}

function classify(input) {
  if (detectAction(input) !== 'validate_only') return 'mutating';
  if (READ_ONLY_LEAD.test(input)) return 'read_only';
  // Ambiguous phrasing with no recognized action verb and no read-only lead —
  // treat as read-only investigation, the safer default (never silently mutate).
  return 'read_only';
}

/**
 * @param {string} input Raw operator text (already transcribed, if voice).
 * @param {{ requestedBy?: string, source?: 'voice'|'text' }} [meta]
 * @returns {{
 *   intent: object,
 *   missingFields: string[],
 *   ambiguities: string[],
 *   riskLevel: 'low'|'medium'|'high',
 *   humanReadable: string,
 *   classification: 'read_only'|'mutating'|'unimplemented',
 *   domain?: string,
 * }}
 */
export function parseWirelessIntent(input, meta = {}) {
  const trimmed = (input ?? '').trim();

  // A catalogued change is checked first: it is the only configuration request
  // that can be previewed as a diff, applied and then proven by read-back, so
  // it outranks the generic update path when both match.
  const modify = parseModifyIntent(trimmed, meta);
  if (modify) return modify;

  const classification = classify(trimmed);
  const action = classification === 'read_only' ? 'validate_only' : detectAction(trimmed);

  const missingFields = [];
  const ambiguities = [];

  if (!SUPPORTED_ACTIONS.has(action)) {
    // Should not happen given detectAction's own union, but fail closed rather
    // than silently falling through to create_wlan.
    return {
      intent: { action: 'validate_only', requestedBy: meta.requestedBy ?? 'unknown', source: meta.source ?? 'text', rawInstruction: trimmed },
      missingFields: [],
      ambiguities: [`Unrecognized action for: "${trimmed}"`],
      riskLevel: 'low',
      humanReadable: 'Could not determine a specific wireless action — treating as a question.',
      classification: 'read_only',
    };
  }

  if (classification === 'read_only' || action === 'validate_only') {
    // Not a WLAN action and not phrased as a question — before defaulting to
    // "read-only investigation" (which would silently hand an imperative
    // configuration request like "create a role" or "set up NTP" to the
    // generic chat pipeline), check whether it's a real, API-backed domain
    // AURA just doesn't have a natural-language path for yet.
    if (!READ_ONLY_LEAD.test(trimmed)) {
      const domain = detectConfigurationDomain(trimmed);
      if (domain) {
        return {
          intent: { action: 'validate_only', requestedBy: meta.requestedBy ?? 'unknown', source: meta.source ?? 'text', rawInstruction: trimmed },
          missingFields: [],
          ambiguities: [
            `AURA recognizes this as a "${domain.name}" request but cannot configure it through natural language yet.`,
            `Local Controller API: ${domain.localApi}`,
            `AURA support: ${domain.auraSupport}`,
          ],
          riskLevel: 'low',
          humanReadable: `Recognized "${domain.name}" — not yet supported through this assistant.`,
          classification: 'unimplemented',
          domain: domain.id,
        };
      }
    }
    return {
      intent: { action: 'validate_only', requestedBy: meta.requestedBy ?? 'unknown', source: meta.source ?? 'text', rawInstruction: trimmed },
      missingFields: [],
      ambiguities: [],
      riskLevel: 'low',
      humanReadable: 'Read-only investigation — routed to the wireless Q&A pipeline.',
      classification: 'read_only',
    };
  }

  if (!IMPLEMENTED_ACTIONS.has(action)) {
    return {
      intent: { action, requestedBy: meta.requestedBy ?? 'unknown', source: meta.source ?? 'text', rawInstruction: trimmed },
      missingFields: ['action'],
      ambiguities: [`"${action}" is recognized but not yet implemented — only creating a new WLAN is supported today.`],
      riskLevel: 'medium',
      humanReadable: `Detected a "${action}" request, which AURA cannot provision yet.`,
      classification: 'mutating',
    };
  }

  // --- create_vlan slot fill ---
  if (action === 'create_vlan') {
    const vlanId = extractVlan(trimmed);
    const topologyName = extractTopologyName(trimmed);
    const mode = extractTopologyMode(trimmed);
    const tagged = extractTagged(trimmed);

    if (vlanId == null) missingFields.push('vlanId');

    const resolvedName = topologyName ?? (vlanId != null ? `VLAN-${vlanId}` : undefined);
    const humanReadableVlan = vlanId != null
      ? `Create a topology "${resolvedName}" for VLAN ${vlanId}${mode ? ` (${mode})` : ''}${tagged === false ? ', untagged' : ''}.`
      : 'Create a new VLAN topology (VLAN ID not specified).';

    return {
      intent: {
        action: 'create_vlan',
        vlanId: vlanId ?? undefined,
        topologyName: resolvedName,
        mode: mode ?? undefined,
        tagged: tagged ?? undefined,
        requestedBy: meta.requestedBy ?? 'unknown',
        source: meta.source === 'voice' ? 'voice' : 'text',
        rawInstruction: trimmed,
      },
      missingFields,
      ambiguities,
      riskLevel: missingFields.length > 0 ? 'medium' : 'low',
      humanReadable: humanReadableVlan,
      classification: 'mutating',
    };
  }

  // --- create_wlan slot fill ---
  const quoted = extractQuoted(trimmed);
  const wlanName =
    quoted[0] ?? extractNamedField(trimmed, ['wlan', 'ssid', 'network', 'wifi', 'wi-fi']) ?? null;
  const vlanId = extractVlan(trimmed);
  const siteName = extractSite(trimmed);
  const security = extractSecurity(trimmed);
  const password = extractPassword(trimmed);

  if (!wlanName) missingFields.push('wlanName');
  if (!siteName) missingFields.push('siteId'); // never infer Global scope silently
  if (!security) {
    missingFields.push('security.mode');
  } else if (
    (security === 'wpa2_personal' || security === 'wpa3_personal') &&
    !password
  ) {
    missingFields.push('security.credentialReference');
  } else if (security === 'open' && password) {
    ambiguities.push('A password was given but security was parsed as Open — confirm intended security mode.');
  }

  const riskLevel = missingFields.length > 0 ? 'medium' : 'high'; // any WLAN create is at least "high" once fully specified — it's a live broadcast change

  const humanReadable = wlanName
    ? `Create a ${security ?? '(security not specified)'} WLAN named "${wlanName}"${vlanId ? ` on VLAN ${vlanId}` : ''}${siteName ? ` at ${siteName}` : ' (site not specified)'}.`
    : 'Create a new WLAN (name not specified).';

  // The editable "what you said" transcript is shown back to the operator
  // verbatim, but a spoken/typed password must never round-trip in plain
  // text once captured — redact it in place (still visible that a
  // credential was given, never what it was).
  const redactedInstruction = password ? trimmed.replaceAll(password, '••••••••') : trimmed;

  return {
    intent: {
      action: 'create_wlan',
      siteName: siteName ?? undefined,
      wlanName: wlanName ?? undefined,
      ssid: wlanName ?? undefined,
      vlanId: vlanId ?? undefined,
      security: security
        ? { mode: security, credentialReference: password ? '(captured, not echoed)' : undefined }
        : undefined,
      requestedBy: meta.requestedBy ?? 'unknown',
      source: meta.source === 'voice' ? 'voice' : 'text',
      rawInstruction: redactedInstruction,
    },
    // Ephemeral, in-memory only — never persisted or logged; consumed once by
    // the validator/provisioning engine and discarded with the request.
    _ephemeralPassword: password ?? undefined,
    missingFields,
    ambiguities,
    riskLevel,
    humanReadable,
    classification: 'mutating',
  };
}
