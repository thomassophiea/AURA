/**
 * Scope resolution — decide WHAT the question is about before spending a token.
 *
 * WHY THIS IS DETERMINISTIC AND SERVER-SIDE
 * -----------------------------------------
 * `modelPolicy.selectModel()` already refuses to let the model choose its own
 * budget, on the grounds that "an LLM that can decide it deserves a bigger
 * budget is a cost incident waiting to happen". The same argument applies to
 * correctness, and more sharply:
 *
 *   - An operator sitting on Site Beta asks "do we have unhappy clients?".
 *     Before this module existed, `scope.siteName` reached the system prompt as
 *     an advisory line and reached NO tool at all, so `getSiteOverview()` ran
 *     unfiltered and a FLEET-WIDE count was reported as if it were theirs.
 *   - The opposite direction is worse. `getSiteOverview` filtered with
 *     `r.SiteName === siteName`, and `src/App.tsx` fills the UI's site name from
 *     `displayName || name || siteName`. A display label that does not equal the
 *     telemetry's `SiteName` filtered to ZERO rows, and zero rows flowed onward
 *     as `clientsWithFindings: 0` — reported, in good faith, as "no problems at
 *     Site X".
 *
 * Both failures are silent, and neither is the model's fault. So scope is
 * resolved here, against a real inventory, and the result is BOUND INTO THE
 * TOOLS rather than suggested to the model.
 *
 * THE RULE THAT MATTERS MOST
 * --------------------------
 * A site name that matches nothing is `unresolved` — never "no results" and
 * never a silent widening to the whole estate. The doctrine already says an
 * empty poll table means UNCONFIGURED rather than healthy; an empty FILTER
 * result deserves exactly the same suspicion, and nothing was enforcing it.
 *
 * INPUT TRUST
 * -----------
 * Matched against the OPERATOR's question only — the same rule
 * `retrieveGuidance()` follows. A site, SSID or AP named "all sites everywhere"
 * must not be able to widen the scope of someone else's investigation.
 */

import { normaliseMac, looksLikeMacFragment, isIpv4 } from './clientResolver.js';

/**
 * Words that mean "do not narrow this to the page I happen to be looking at".
 *
 * This list is the one genuinely heuristic thing in the module, and it is
 * deliberately conservative: a false FLEET reading shows the operator more than
 * they asked for and says so, which is recoverable. A false SITE reading hides
 * an outage at the site next door, which is not.
 */
const FLEET_PATTERNS = [
  /\b(?:any|anyone|anybody|anything)\b/i,
  /\b(?:all|every|everywhere|estate|fleet|globally|org(?:anization|anisation)?[- ]wide)\b/i,
  /\bacross (?:the )?(?:sites?|estate|network|fleet|org(?:anization|anisation)?)\b/i,
  /\bwhich (?:site|sites|gateway|gateways)\b/i,
  /\b(?:worst|best|top|most affected|biggest)\b/i,
  /\bhow many (?:sites|gateways)\b/i,
  /\bcompare (?:the )?sites\b/i,
  /\bwhat should i worry about\b/i,
  /\bwhat changed overnight\b/i,
];

/**
 * Phrases that name a site WITHOUT naming one we know. Used only to tell
 * "the operator asked about a site we cannot find" apart from "the operator
 * mentioned no site at all" — a distinction that decides whether we clarify or
 * proceed, so it must not quietly collapse into one branch.
 */
const SITE_PHRASE_PATTERNS = [
  // EXPLICIT forms: the operator said the word "site" and then named one, or
  // quoted a name. These are trusted enough to beat a stray fleet word —
  // "any issues at site Boston?" is about Boston, not the estate.
  {
    weak: false,
    re: /\b(?:at|in|for|on)\s+(?:the\s+)?site\s+["']?([A-Za-z0-9][A-Za-z0-9 _.-]{1,40}?)["']?(?=[,.?!]|$|\s+(?:site|and|or|but|which|that|is|are|has|have))/i,
  },
  {
    weak: false,
    re: /\bsite\s+(?:called|named)\s+["']?([A-Za-z0-9][A-Za-z0-9 _.-]{1,40}?)["']?(?=[,.?!]|$)/i,
  },
  { weak: false, re: /\b(?:at|in)\s+(?:the\s+)?["']([A-Za-z0-9][A-Za-z0-9 _.-]{1,40})["']/i },
  // WEAK form: "<name> site" — capped at three words. An unbounded capture here
  // swallowed the whole clause: "what is wrong at this site?" yielded the phrase
  // "what is wrong at this", which then matched nothing and produced a
  // clarification for a question that never named a site at all.
  //
  // This one reads ordinary prose as a proper noun, so its capture gets the
  // stricter cleaning in `cleanWeakSitePhrase`.
  {
    weak: true,
    re: /\b((?:[A-Za-z0-9][A-Za-z0-9_.-]*)(?:\s+[A-Za-z0-9][A-Za-z0-9_.-]*){0,2})\s+site\b/i,
  },
];

/**
 * Determiners and quantifiers. When one of these is the word immediately before
 * "site", the sentence is quantifying OVER sites and has named none.
 *
 * This is the whole of the "flag any site" bug: `cleanSitePhrase` trimmed the
 * trailing "any" and kept what came before it, so
 * "...and flag any site with no telemetry" reported a site called "flag" and
 * clarified a question that had already said "which sites", "worst" and "any".
 * The determiner is not filler to be trimmed — it is proof there is no name.
 */
const SITE_PHRASE_QUANTIFIERS = new Set([
  'a', 'an', 'the', 'this', 'that', 'these', 'those', 'any', 'each', 'every',
  'all', 'no', 'some', 'other', 'another', 'same', 'one', 'which', 'what',
  'whatever', 'per', 'my', 'our', 'your', 'their', 'its',
]);

/**
 * Prepositions and conjunctions. A site name contains none of them, so
 * everything up to and including the last one is sentence, not name.
 *
 * "add a guest nbetwork to primary site" captured "nbetwork to primary" and
 * asked which site that was. The name is the tail: "primary".
 */
const SITE_PHRASE_CONNECTIVES = new Set([
  'at', 'in', 'on', 'for', 'to', 'of', 'and', 'or', 'with', 'about', 'from',
  'by', 'into', 'onto', 'than', 'then', 'but',
]);

/**
 * Words that stand in for the inherited scope rather than naming a site, and
 * the sentence filler that can end up inside a capture. A phrase that is only
 * these names nothing.
 */
const SITE_PHRASE_STOPWORDS = new Set([
  'this', 'that', 'the', 'a', 'an', 'our', 'my', 'your', 'their', 'its',
  'each', 'every', 'all', 'any', 'other', 'another', 'same', 'current',
  'is', 'are', 'was', 'were', 'at', 'in', 'on', 'for', 'to', 'of', 'and', 'or',
  'what', 'which', 'wrong', 'happening', 'going', 'up', 'with', 'about',
]);

/**
 * Trim filler off a captured phrase and reject one that names nothing.
 *
 * Returns null when what is left is only stopwords — "this site" and "the site"
 * mean the page you are on, not a building called "this".
 */
function cleanSitePhrase(raw) {
  const tokens = String(raw ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  while (tokens.length && SITE_PHRASE_STOPWORDS.has(tokens[0].toLowerCase())) tokens.shift();
  while (tokens.length && SITE_PHRASE_STOPWORDS.has(tokens[tokens.length - 1].toLowerCase())) {
    tokens.pop();
  }
  if (!tokens.length) return null;
  const phrase = tokens.join(' ');
  return phrase.length >= 2 ? phrase : null;
}

/**
 * Clean a capture from the weak "<words> site" pattern, which sees prose.
 *
 * Two rejections the end-trimming in `cleanSitePhrase` cannot make, because
 * trimming a word off the end keeps whatever preceded it:
 *
 *   "flag any site ..."             → determiner before "site" → NO name
 *   "guest nbetwork to primary site" → name is the tail after "to" → "primary"
 *
 * Returning null here is not a lost answer: the resolver falls through to the
 * fleet verb and then to the estate default, both of which say what they cover.
 */
function cleanWeakSitePhrase(raw) {
  const tokens = String(raw ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return null;

  if (SITE_PHRASE_QUANTIFIERS.has(tokens[tokens.length - 1].toLowerCase())) return null;

  let start = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    if (SITE_PHRASE_CONNECTIVES.has(tokens[i].toLowerCase())) start = i + 1;
  }
  return cleanSitePhrase(tokens.slice(start).join(' '));
}

/** AP serials on this platform: two letters, digits, a letter, a dash, a tail. */
const AP_SERIAL_RE = /\b[A-Z]{2}\d{6,9}[A-Z]?-?[A-Z0-9]{4,8}\b/;

/**
 * Fold a site name to a comparison key.
 *
 * `AURA_LAB`, `Aura Lab`, `aura-lab` and `aura lab` are the same site typed four
 * ways, and an operator types whichever one they remember. Punctuation and case
 * carry no meaning in a site name, so neither may decide whether an
 * investigation finds anything.
 */
export function normaliseSiteKey(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Tokens of a normalised key, for subset matching. */
function tokensOf(value) {
  const key = normaliseSiteKey(value);
  return key ? key.split(' ') : [];
}

/**
 * Every key one site name answers to.
 *
 * `normaliseSiteKey` folds punctuation to a word break, which is why `AURA_LAB`
 * and `aura lab` are the same site. It inserts no break into camelCase, so
 * `PrimarySite` folded to `primarysite` and an operator typing "primary site"
 * matched NOTHING — the site was in the catalogue, named in the question, and
 * the resolver still asked which site was meant. Same class of failure as the
 * punctuation one, in the direction nobody checked.
 */
export function siteKeyVariants(siteName) {
  const raw = String(siteName ?? '');
  const keys = new Set();
  const direct = normaliseSiteKey(raw);
  if (direct) keys.add(direct);
  const split = normaliseSiteKey(raw.replace(/([a-z0-9])([A-Z])/g, '$1 $2'));
  if (split) keys.add(split);
  return [...keys];
}

/**
 * Score how well an operator's phrase matches a known site.
 *
 * Returns null for no match. Higher is better. Deliberately NOT an edit
 * distance: "Site A" and "Site B" are one character apart and are different
 * buildings, whereas "aura lab" and "AURA_LAB" differ by every character of
 * punctuation and are the same one. Token identity is the thing that carries
 * meaning here.
 */
export function scoreSiteMatch(phrase, siteName) {
  const p = normaliseSiteKey(phrase);
  if (!p) return null;
  // Best over every spelling the site answers to, so "primary site" scores
  // against "primary site" rather than only against "primarysite".
  let best = null;
  for (const s of siteKeyVariants(siteName)) {
    const score = scoreAgainstKey(p, s);
    if (score !== null && (best === null || score > best)) best = score;
  }
  return best;
}

function scoreAgainstKey(p, s) {
  if (!p || !s) return null;
  if (p === s) return 100;
  // The site name appears whole inside what the operator wrote, or vice versa.
  if (p.includes(s)) return 80 - (p.length - s.length);
  if (s.includes(p)) return 70 - (s.length - p.length);
  // Every token of the site name is present in the phrase, in any order.
  const pt = new Set(tokensOf(p));
  const st = tokensOf(s);
  if (st.length && st.every((t) => pt.has(t))) return 60;
  return null;
}

/**
 * Every known site name that appears in the question.
 *
 * Longest name first, so a question mentioning "AURA_LAB_2" resolves to that
 * site and not to "AURA_LAB" as well. Without the length ordering a
 * superstring/substring pair reads as an ambiguity and triggers a pointless
 * clarification.
 */
export function findNamedSites(question, sites = []) {
  const q = normaliseSiteKey(question);
  if (!q) return [];
  // Padded, and matched on whole words. A bare `includes` scoped an
  // investigation to the site called EAL on the words "real", "meal" and
  // "healthy" — a three-letter site name is a substring of ordinary English.
  const padded = ` ${q} `;
  const entries = sites
    .map((site) => ({ site, keys: siteKeyVariants(site.name).filter(Boolean) }))
    .filter((e) => e.keys.length);
  const longest = (e) => Math.max(...e.keys.map((k) => k.length));
  entries.sort((a, b) => longest(b) - longest(a));

  const hits = [];
  const claimed = [];
  for (const { site, keys } of entries) {
    const hit = keys.find((key) => padded.includes(` ${key} `));
    if (!hit) continue;
    // A shorter name fully contained in one we already matched is the same
    // mention, not a second site.
    if (claimed.some((c) => c.includes(hit))) continue;
    claimed.push(hit);
    hits.push(site);
  }
  return hits;
}

/** The site-ish phrase the operator used, when no known site matched it. */
export function extractSitePhrase(question) {
  const text = String(question ?? '');
  for (const { re, weak } of SITE_PHRASE_PATTERNS) {
    const m = text.match(re);
    if (!m || !m[1]) continue;
    const candidate = weak ? cleanWeakSitePhrase(m[1]) : cleanSitePhrase(m[1]);
    if (candidate) return candidate;
  }
  return null;
}

/**
 * Does `key` appear in the question as a REFERENCE to a thing that exists?
 *
 * Two ways a bare `includes` got this wrong, both with live names:
 *
 *   - Substring. An SSID or site called "EAL" matched inside "real", "meal" and
 *     "healthy", scoping an investigation to it on a question that never
 *     mentioned it. Whole words only.
 *   - Indefinite article. "can you add a guest network to primary site?" matched
 *     the existing SSID "Guest" and returned entity scope, so a request to
 *     CREATE a network was answered as a question about one that already exists.
 *     "a guest network" describes a kind of thing; "is Guest broadcasting?"
 *     points at one. An "a"/"an" immediately before the name is the tell.
 *
 * A name that appears once, article-prefixed, is descriptive. The same name
 * appearing anywhere else in the sentence still counts as a reference.
 */
function namesEntity(paddedQuestion, key) {
  const token = ` ${key} `;
  for (let idx = paddedQuestion.indexOf(token); idx !== -1; ) {
    // Everything up to and including the space that opens this occurrence.
    if (!/ (?:a|an) $/.test(paddedQuestion.slice(0, idx + 1))) return true;
    idx = paddedQuestion.indexOf(token, idx + 1);
  }
  return false;
}

/** Does the question name a specific client, AP or SSID? */
export function findNamedEntity(question, inventory = {}) {
  const text = String(question ?? '').trim();
  if (!text) return null;

  // An IPv4 address before a MAC: an address like 192.168.100.122 strips to
  // exactly 12 hex digits and parses as a valid MAC. clientResolver learned
  // this the same way.
  const ipMatch = text.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/);
  if (ipMatch && isIpv4(ipMatch[0])) return { kind: 'client', value: ipMatch[0], matchedOn: 'IP' };

  const macMatch = text.match(/\b(?:[0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}\b|\b[0-9a-fA-F]{12}\b/);
  if (macMatch && normaliseMac(macMatch[0])) {
    return { kind: 'client', value: normaliseMac(macMatch[0]), matchedOn: 'MAC' };
  }

  const serialMatch = text.match(AP_SERIAL_RE);
  if (serialMatch) return { kind: 'ap', value: serialMatch[0], matchedOn: 'AP serial' };

  // Known SSIDs, longest first for the same reason sites are.
  const ssids = [...(inventory.ssids ?? [])].sort((a, b) => String(b).length - String(a).length);
  const paddedQuestion = ` ${normaliseSiteKey(text)} `;
  for (const ssid of ssids) {
    const key = normaliseSiteKey(ssid);
    if (key && key.length >= 3 && namesEntity(paddedQuestion, key)) {
      return { kind: 'wlan', value: ssid, matchedOn: 'SSID name' };
    }
  }

  // Known AP names.
  const apNames = [...(inventory.apNames ?? [])].sort((a, b) => String(b).length - String(a).length);
  for (const apName of apNames) {
    const key = normaliseSiteKey(apName);
    if (key && key.length >= 4 && namesEntity(paddedQuestion, key)) {
      return { kind: 'ap', value: apName, matchedOn: 'AP name' };
    }
  }

  // A partial MAC the operator quoted ("the client ending 49:1A"). Checked last
  // because 4 hex digits is a weak signal and collides with ordinary words.
  const fragment = text.match(/\b(?:[0-9a-fA-F]{2}[:-]){1,4}[0-9a-fA-F]{2}\b/);
  if (fragment && looksLikeMacFragment(fragment[0])) {
    return { kind: 'client', value: fragment[0], matchedOn: 'partial MAC' };
  }

  return null;
}

export function mentionsFleet(question) {
  const text = String(question ?? '');
  return FLEET_PATTERNS.some((re) => re.test(text));
}

/**
 * @typedef {object} SiteRecord
 * @property {string} name          the canonical name to filter telemetry with
 * @property {string[]} [aliases]   other names the same site answers to
 * @property {boolean} [hasTelemetry]
 * @property {number} [apCount]
 * @property {number} [clientCount]
 */

/**
 * @typedef {object} ResolvedScope
 * @property {'entity'|'site'|'fleet'} level
 * @property {string[]|null} siteNames   canonical names, telemetry-matched
 * @property {object|null} entity
 * @property {Array} candidates          populated only when clarification is needed
 * @property {boolean} needsClarification
 * @property {string} reason             one line, shown to the operator
 * @property {string[]} unresolved       names the operator used that matched nothing
 * @property {string} source             which rule fired, for the audit log
 */

/**
 * Resolve the scope of one question.
 *
 * Seven rules, first match wins. The ordering is the design: an explicitly
 * named thing always beats an inherited page, and an explicit "everyone" always
 * beats both.
 *
 * @param {object} args
 * @param {string} args.question
 * @param {object} [args.uiScope]    { siteName, ssid, apSerial, mac } from the UI
 * @param {object} [args.inventory]  { sites, ssids, apNames }
 * @returns {ResolvedScope}
 */
export function resolveScope({ question, uiScope = {}, inventory = {} } = {}) {
  const sites = Array.isArray(inventory.sites) ? inventory.sites : [];
  const base = {
    level: 'fleet',
    siteNames: null,
    entity: null,
    candidates: [],
    needsClarification: false,
    reason: '',
    unresolved: [],
    source: 'default',
  };

  // ── Rule 1: an explicitly named client / AP / WLAN wins outright. ─────────
  // The page someone happens to be on says nothing about a MAC they typed.
  const entity = findNamedEntity(question, inventory);
  if (entity) {
    return {
      ...base,
      level: 'entity',
      entity,
      reason: `You named a specific ${entity.kind} (${entity.matchedOn}), so the investigation follows it wherever it is.`,
      source: 'rule1-named-entity',
    };
  }

  // A MAC handed in by the UI (the operator clicked a client row) is the same
  // thing as naming one, and must not be overridden by a page's site.
  if (uiScope?.mac && normaliseMac(uiScope.mac)) {
    return {
      ...base,
      level: 'entity',
      entity: { kind: 'client', value: normaliseMac(uiScope.mac), matchedOn: 'selected in the UI' },
      reason: 'Scoped to the client you have selected.',
      source: 'rule1-ui-entity',
    };
  }

  // ── Rules 2-4: a site named in the question. ─────────────────────────────
  const named = findNamedSites(question, sites);
  if (named.length === 1) {
    return {
      ...base,
      level: 'site',
      siteNames: [named[0].name],
      reason: `Scoped to ${named[0].name}, which you named.`,
      source: 'rule2-named-site',
    };
  }
  if (named.length > 1) {
    return {
      ...base,
      level: 'site',
      siteNames: named.map((s) => s.name),
      candidates: named.map((s) => ({ label: s.name, value: s.name })),
      needsClarification: true,
      reason: `More than one site matches what you named: ${named.map((s) => s.name).join(', ')}.`,
      source: 'rule3-ambiguous-site',
    };
  }

  const phrase = extractSitePhrase(question);
  if (phrase) {
    // Rank the whole catalogue against what they typed. A near miss is worth
    // offering; a total miss still has to be said out loud rather than
    // silently widening to the estate.
    const ranked = sites
      .map((s) => ({ site: s, score: scoreSiteMatch(phrase, s.name) }))
      .filter((r) => r.score !== null)
      .sort((a, b) => b.score - a.score);

    if (ranked.length === 1) {
      return {
        ...base,
        level: 'site',
        siteNames: [ranked[0].site.name],
        reason: `Read "${phrase}" as ${ranked[0].site.name}.`,
        source: 'rule2-fuzzy-site',
      };
    }
    return {
      ...base,
      level: sites.length ? 'site' : 'fleet',
      siteNames: null,
      candidates: (ranked.length ? ranked.map((r) => r.site) : sites)
        .slice(0, 6)
        .map((s) => ({ label: s.name, value: s.name })),
      needsClarification: true,
      unresolved: [phrase],
      reason: ranked.length
        ? `"${phrase}" could be more than one site.`
        : `No site is called "${phrase}". Rather than search the whole estate and report a number that is not yours, tell me which site you meant.`,
      source: ranked.length ? 'rule3-fuzzy-ambiguous' : 'rule4-unresolved-site',
    };
  }

  // ── Rule 5: "anyone / everywhere / which site / worst" beats the page. ────
  if (mentionsFleet(question)) {
    return {
      ...base,
      level: 'fleet',
      reason: uiScope?.siteName
        ? `Answering across every site — you asked about the estate, not just ${uiScope.siteName}.`
        : 'Answering across every site.',
      source: 'rule5-fleet-verb',
    };
  }

  // ── Rule 6: inherit the page, but only if it resolves to a real site. ────
  if (uiScope?.siteName) {
    const match = sites.find((s) => normaliseSiteKey(s.name) === normaliseSiteKey(uiScope.siteName));
    if (match) {
      return {
        ...base,
        level: 'site',
        siteNames: [match.name],
        reason: `Scoped to ${match.name}, the site you are looking at.`,
        source: 'rule6-inherited-site',
      };
    }
    // THE SILENT-ZERO GUARD. The UI label does not correspond to any site the
    // Gateway reports. Filtering on it yields nothing, and nothing reads as
    // health. Say so instead.
    return {
      ...base,
      level: sites.length ? 'site' : 'fleet',
      siteNames: null,
      candidates: sites.slice(0, 6).map((s) => ({ label: s.name, value: s.name })),
      needsClarification: sites.length > 0,
      unresolved: [uiScope.siteName],
      reason:
        `The page says "${uiScope.siteName}", but no site by that name appears in Gateway ` +
        'data — so filtering on it would return an empty result that looks like good news. ' +
        'Pick the site you meant, or ask across the estate.',
      source: 'rule6-ui-scope-unmatched',
    };
  }

  // ── Rule 7: nothing narrowed it. The estate is the honest default. ───────
  return {
    ...base,
    level: 'fleet',
    reason: 'No site was specified, so this covers every site.',
    source: 'rule7-default-fleet',
  };
}

/**
 * The scope block for the system prompt.
 *
 * Says ONE true thing: the tools are already scoped. The previous wording —
 * "UI SCOPE (inherited, operator can change)" — described a hint the model was
 * free to honour or ignore, with no rule for which, and it reached no tool
 * either way.
 */
export function buildResolvedScopeBlock(resolved) {
  if (!resolved) return '';
  if (resolved.level === 'entity') {
    return `SCOPE: this question is about one ${resolved.entity.kind}, identified by ${resolved.entity.matchedOn}. Follow it wherever it is; do not filter by site.`;
  }
  if (resolved.level === 'site' && resolved.siteNames?.length) {
    const list = resolved.siteNames.join(', ');
    return `SCOPE: the tools are ALREADY filtered to ${list}. Every count and every list you receive is for ${list} alone — say so when you report a number. Pass a site argument only to deliberately change this.`;
  }
  return 'SCOPE: the tools cover EVERY site on this Gateway. Any count you report is estate-wide — say so, and name the sites a finding actually lands in.';
}

/**
 * Turn a clarification into the payload the UI renders as chips.
 *
 * Costs no tokens: this is emitted BEFORE any provider call. One extra click in
 * the genuinely ambiguous case is cheaper than a confident answer about the
 * wrong building.
 */
export function buildClarification(resolved, { question } = {}) {
  if (!resolved?.needsClarification) return null;
  const candidates = (resolved.candidates ?? []).slice(0, 6);
  return {
    question: resolved.reason,
    originalQuestion: question ?? '',
    candidates,
    allOption:
      candidates.length > 1
        ? { label: `Check all ${candidates.length} sites`, value: '__all_sites__' }
        : { label: 'Check every site', value: '__all_sites__' },
    unresolved: resolved.unresolved ?? [],
  };
}
