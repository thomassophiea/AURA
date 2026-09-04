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
 * Supported action today: `create_wlan`. Other actions in the
 * WirelessConfigurationIntent union are recognized (so the operator gets an
 * honest "not yet supported" message) but do not produce a mutating plan —
 * see the migration matrix's deferred scope.
 */

const CREATE_VERBS =
  /\b(create|add|make|stand up|set up|deploy|push|build|configure)\b.*\b(wlan|ssid|wifi|wi-fi|wireless network|guest network|network)\b/i;
const DELETE_VERBS = /\b(delete|remove|tear down)\b.*\b(wlan|ssid|network)\b/i;
const UPDATE_VERBS =
  /\b(disable|hide|enable|unhide|show|update|change|rename|rotate)\b.*\b(wlan|ssid|network|password|psk)\b/i;
const ASSIGN_VERBS = /\bdeploy\b.*\bto\b|\bassign\b.*\b(profile|ap)\b/i;
const SCHEDULE_VERBS = /\bschedule\b.*\b(wlan|ssid|network)\b/i;

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
  'update_wlan',
  'delete_wlan',
  'assign_wlan',
  'schedule_wlan',
  'validate_only',
]);

const IMPLEMENTED_ACTIONS = new Set(['create_wlan', 'validate_only']);

function extractQuoted(input) {
  const matches = input.match(/["“]([^"”]{1,32})["”]/g) ?? [];
  return matches.map((m) => m.replace(/["“”]/g, '').trim()).filter(Boolean);
}

function extractNamedField(input, keywords) {
  // "called Guest", "named Guest-WiFi", "the Guest network"
  const re = new RegExp(`(?:${keywords.join('|')})\\s+(?:called|named)?\\s*["“]?([A-Za-z0-9][A-Za-z0-9 _-]{0,31})["”]?`, 'i');
  const m = input.match(re);
  return m ? m[1].trim() : null;
}

function extractVlan(input) {
  const m = input.match(/vlan\s*(?:id)?\s*#?\s*(\d{1,4})\b/i);
  if (!m) return null;
  const id = parseInt(m[1], 10);
  return Number.isInteger(id) && id >= 1 && id <= 4094 ? id : null;
}

function extractSite(input) {
  // "at Boston Office", "at the Boston site", "for Site Alpha"
  const m = input.match(/\b(?:at|for|in)\s+(?:the\s+)?([A-Z][A-Za-z0-9][\w'&-]*(?:\s+[A-Z][\w'&-]*){0,3})(?:\s+site)?\b/);
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

// Single source of truth for "which mutating action is this" — classify()
// delegates here rather than keeping a separate, easy-to-desync verb check.
function detectAction(input) {
  if (DELETE_VERBS.test(input)) return 'delete_wlan';
  if (UPDATE_VERBS.test(input)) return 'update_wlan';
  if (ASSIGN_VERBS.test(input)) return 'assign_wlan';
  if (SCHEDULE_VERBS.test(input)) return 'schedule_wlan';
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
 *   classification: 'read_only'|'mutating',
 * }}
 */
export function parseWirelessIntent(input, meta = {}) {
  const trimmed = (input ?? '').trim();
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
