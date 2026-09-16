import { describe, it, expect } from 'vitest';
import {
  resolveScope,
  normaliseSiteKey,
  scoreSiteMatch,
  findNamedSites,
  findNamedEntity,
  extractSitePhrase,
  mentionsFleet,
  buildResolvedScopeBlock,
  buildClarification,
} from './scopeResolver.js';

/** A small estate, shaped like the lab: one busy site, one quiet, two similar. */
const SITES = [
  { name: 'AURA_LAB', hasTelemetry: true, apCount: 5, clientCount: 47 },
  { name: 'PrimarySite', hasTelemetry: true, apCount: 12, clientCount: 130 },
  { name: 'Beta North', hasTelemetry: true, apCount: 3, clientCount: 8 },
  { name: 'Beta South', hasTelemetry: false, apCount: 2, clientCount: 0 },
];
const INVENTORY = {
  sites: SITES,
  ssids: ['AURA_PSAE', 'Skynet', 'Guest'],
  apNames: ['AP5020-PVT-03_MESH_ROOT'],
};

describe('normaliseSiteKey', () => {
  it('folds the four ways an operator types the same site', () => {
    const forms = ['AURA_LAB', 'Aura Lab', 'aura-lab', '  aura   lab  '];
    const keys = new Set(forms.map(normaliseSiteKey));
    expect(keys.size).toBe(1);
  });

  it('is empty for nullish input rather than the string "null"', () => {
    expect(normaliseSiteKey(null)).toBe('');
    expect(normaliseSiteKey(undefined)).toBe('');
  });
});

describe('scoreSiteMatch', () => {
  it('scores punctuation-only differences as an exact match', () => {
    expect(scoreSiteMatch('aura lab', 'AURA_LAB')).toBe(100);
  });

  it('does not match two different buildings that differ by one character', () => {
    // The reason this is token identity and not edit distance: "Beta North" and
    // "Beta South" are near neighbours by character and are different places.
    expect(scoreSiteMatch('Beta North', 'Beta South')).toBeNull();
  });

  it('matches when every token of the site name is present out of order', () => {
    expect(scoreSiteMatch('north beta', 'Beta North')).toBe(60);
  });
});

describe('findNamedSites', () => {
  it('finds a site named with different punctuation', () => {
    expect(findNamedSites('how is aura-lab doing?', SITES).map((s) => s.name)).toEqual(['AURA_LAB']);
  });

  it('treats a substring of a longer matched name as one mention, not two sites', () => {
    const sites = [{ name: 'AURA_LAB' }, { name: 'AURA_LAB_2' }];
    expect(findNamedSites('what about AURA_LAB_2?', sites).map((s) => s.name)).toEqual([
      'AURA_LAB_2',
    ]);
  });

  it('returns both when two genuinely different sites are named', () => {
    const hits = findNamedSites('compare Beta North and Beta South', SITES);
    expect(hits.map((s) => s.name).sort()).toEqual(['Beta North', 'Beta South']);
  });
});

describe('findNamedEntity', () => {
  it('reads an IPv4 address as an IP, never as a MAC', () => {
    // 192.168.100.122 strips to exactly 12 hex digits and parses as a valid
    // MAC. clientResolver learned this the hard way; so does this.
    expect(findNamedEntity('why is 192.168.100.122 slow?', INVENTORY)).toEqual({
      kind: 'client',
      value: '192.168.100.122',
      matchedOn: 'IP',
    });
  });

  it('normalises a MAC written with dashes', () => {
    expect(findNamedEntity('check D0-57-7E-C4-49-1A', INVENTORY)).toMatchObject({
      kind: 'client',
      value: 'D0:57:7E:C4:49:1A',
    });
  });

  it('recognises an AP serial', () => {
    expect(findNamedEntity('what is wrong with AP5020 serial WM012243W-30032?', INVENTORY))
      .toMatchObject({ kind: 'ap', matchedOn: 'AP serial' });
  });

  it('recognises a known SSID', () => {
    expect(findNamedEntity('is AURA_PSAE broadcasting?', INVENTORY)).toMatchObject({
      kind: 'wlan',
      value: 'AURA_PSAE',
    });
  });

  it('returns null when nothing specific is named', () => {
    expect(findNamedEntity('is the wifi slow?', INVENTORY)).toBeNull();
  });
});

describe('extractSitePhrase', () => {
  it('captures a site name we do not know', () => {
    expect(extractSitePhrase('how are things at site Boston?')).toMatch(/boston/i);
  });

  it('ignores a pronoun standing in for the inherited scope', () => {
    expect(extractSitePhrase('what is wrong at this site?')).toBeNull();
  });
});

describe('mentionsFleet', () => {
  it.each([
    'do we have any unhappy clients?',
    'which site is worst?',
    'what should I worry about today?',
    'is this happening everywhere?',
    'show the top offenders across the estate',
  ])('treats %s as an estate-wide question', (q) => {
    expect(mentionsFleet(q)).toBe(true);
  });

  it('does not read an ordinary question as estate-wide', () => {
    expect(mentionsFleet('why is this client slow?')).toBe(false);
  });
});

describe('resolveScope — the seven rules', () => {
  it('rule 1: a named entity beats the page you are on', () => {
    const r = resolveScope({
      question: 'why is D0:57:7E:C4:49:1A unhappy?',
      uiScope: { siteName: 'PrimarySite' },
      inventory: INVENTORY,
    });
    expect(r.level).toBe('entity');
    expect(r.entity.value).toBe('D0:57:7E:C4:49:1A');
    expect(r.siteNames).toBeNull();
  });

  it('rule 1: a client selected in the UI is a named entity too', () => {
    const r = resolveScope({
      question: 'what is wrong?',
      uiScope: { mac: 'd0577ec4491a', siteName: 'PrimarySite' },
      inventory: INVENTORY,
    });
    expect(r.level).toBe('entity');
    expect(r.entity.value).toBe('D0:57:7E:C4:49:1A');
  });

  it('rule 2: one named site resolves straight to it', () => {
    const r = resolveScope({ question: 'how many APs at aura lab?', inventory: INVENTORY });
    expect(r.level).toBe('site');
    expect(r.siteNames).toEqual(['AURA_LAB']);
    expect(r.needsClarification).toBe(false);
  });

  it('rule 3: two named sites ask which one', () => {
    const r = resolveScope({
      question: 'any problems at Beta North or Beta South?',
      inventory: INVENTORY,
    });
    expect(r.needsClarification).toBe(true);
    expect(r.candidates.map((c) => c.value).sort()).toEqual(['Beta North', 'Beta South']);
  });

  it('rule 4: a site that does not exist is asked about, never silently widened', () => {
    const r = resolveScope({ question: 'any issues at site Boston?', inventory: INVENTORY });
    expect(r.needsClarification).toBe(true);
    expect(r.unresolved).toEqual(['Boston']);
    // The failure this prevents: answering estate-wide and presenting the
    // number as Boston's.
    expect(r.level).not.toBe('fleet');
    expect(r.reason).toMatch(/whole estate|which site/i);
  });

  it('rule 5: an estate-wide verb overrides the inherited page scope', () => {
    const r = resolveScope({
      question: 'do we have any unhappy clients?',
      uiScope: { siteName: 'Beta North' },
      inventory: INVENTORY,
    });
    expect(r.level).toBe('fleet');
    expect(r.reason).toMatch(/Beta North/);
  });

  it('rule 6: an inherited page scope that resolves is honoured', () => {
    const r = resolveScope({
      question: 'how are the clients doing?',
      uiScope: { siteName: 'Beta North' },
      inventory: INVENTORY,
    });
    expect(r.level).toBe('site');
    expect(r.siteNames).toEqual(['Beta North']);
  });

  it('rule 6: an inherited page scope that matches NOTHING is the silent-zero guard', () => {
    // This is the bug that shipped: src/App.tsx fills siteName from
    // `displayName || name || siteName`, so a display label reaches the filter,
    // matches no telemetry row, and zero rows read as "no problems here".
    const r = resolveScope({
      question: 'how are the clients doing?',
      uiScope: { siteName: 'Beta North Campus (Building 4)' },
      inventory: INVENTORY,
    });
    expect(r.needsClarification).toBe(true);
    expect(r.siteNames).toBeNull();
    expect(r.unresolved).toEqual(['Beta North Campus (Building 4)']);
    expect(r.reason).toMatch(/looks like good news/i);
  });

  it('rule 7: nothing narrows it, so the estate is the honest default', () => {
    const r = resolveScope({ question: 'how are the clients doing?', inventory: INVENTORY });
    expect(r.level).toBe('fleet');
    expect(r.needsClarification).toBe(false);
  });

  it('never emits a site filter it could not match', () => {
    // The invariant the whole module exists to hold: siteNames is either a list
    // of canonical names that came out of the inventory, or null.
    const questions = [
      'any issues at site Boston?',
      'how are things at this site?',
      'do we have unhappy clients?',
      'why is 10.1.1.4 slow?',
      'what about Beta North and Beta South?',
    ];
    const known = new Set(SITES.map((s) => s.name));
    for (const q of questions) {
      const r = resolveScope({ question: q, uiScope: { siteName: 'Nowhere' }, inventory: INVENTORY });
      for (const name of r.siteNames ?? []) expect(known.has(name)).toBe(true);
    }
  });

  it('degrades to fleet when the inventory itself is empty', () => {
    // No site list (a Gateway that will not serve /v3/sites) must not turn every
    // question into a clarification the operator cannot answer.
    const r = resolveScope({
      question: 'how are the clients doing?',
      uiScope: { siteName: 'Whatever' },
      inventory: { sites: [] },
    });
    expect(r.level).toBe('fleet');
    expect(r.needsClarification).toBe(false);
  });
});

describe('buildResolvedScopeBlock', () => {
  it('states that the tools are already filtered, not that scope is a hint', () => {
    const block = buildResolvedScopeBlock({ level: 'site', siteNames: ['AURA_LAB'] });
    expect(block).toMatch(/ALREADY filtered to AURA_LAB/);
    expect(block).not.toMatch(/hint/i);
  });

  it('tells the model to say a fleet number is fleet-wide', () => {
    expect(buildResolvedScopeBlock({ level: 'fleet' })).toMatch(/estate-wide/i);
  });

  it('tells the model not to filter by site when following one entity', () => {
    const block = buildResolvedScopeBlock({
      level: 'entity',
      entity: { kind: 'client', matchedOn: 'MAC' },
    });
    expect(block).toMatch(/do not filter by site/i);
  });
});

describe('buildClarification', () => {
  it('is null when nothing needs clarifying', () => {
    expect(buildClarification({ needsClarification: false })).toBeNull();
  });

  it('offers the candidates plus an explicit all-sites escape', () => {
    const resolved = resolveScope({
      question: 'problems at Beta North or Beta South?',
      inventory: INVENTORY,
    });
    const c = buildClarification(resolved, { question: 'problems?' });
    expect(c.candidates).toHaveLength(2);
    expect(c.allOption.value).toBe('__all_sites__');
    expect(c.originalQuestion).toBe('problems?');
  });
});

/**
 * Regressions from the field, 2026-09-15. Three separate defects, all visible
 * in one screenshot of the panel:
 *
 *   "Which sites have clients with problems right now? Rank them worst first,
 *    and flag any site with no telemetry at all."
 *      → extracted the site name "flag", and clarified instead of answering a
 *        question that trips THREE fleet patterns ("which sites", "worst", "any").
 *
 *   "can you add a guest nbetwork to primary site?"
 *      → extracted the site name "nbetwork to primary".
 *      → and even "primary site" alone could not match a site called
 *        "PrimarySite", because the fold inserts no word break into camelCase.
 *
 * The common shape: the weak "<words> site" pattern treats ordinary prose as a
 * proper noun, and a guess made from prose then outranks an explicit estate-wide
 * verb. A wrong clarification is not a safe failure — it stops the operator
 * dead on a question the platform could have answered.
 */
describe('scope resolution — prose is not a site name', () => {
  it('does not read a quantifier over sites as the name of one', () => {
    // "any site", "every site", "each site" quantify OVER sites. There is no
    // building called "flag".
    expect(extractSitePhrase('flag any site with no telemetry at all')).toBeNull();
    expect(extractSitePhrase('rank every site worst first')).toBeNull();
    expect(extractSitePhrase('check each site for problems')).toBeNull();
    expect(extractSitePhrase('no site has telemetry')).toBeNull();
  });

  it('answers the estate-wide question instead of asking which site "flag" is', () => {
    const r = resolveScope({
      question:
        'Which sites have clients with problems right now? Rank them worst first, and flag any site with no telemetry at all.',
      inventory: INVENTORY,
    });
    expect(r.needsClarification).toBe(false);
    expect(r.level).toBe('fleet');
    expect(r.source).toBe('rule5-fleet-verb');
  });

  it('keeps only the name-ish tail when prose runs into the phrase', () => {
    // "guest nbetwork to primary site" — a site name contains no preposition,
    // so everything up to and including the last one is prose.
    expect(extractSitePhrase('can you add a guest nbetwork to primary site?')).toBe('primary');
  });

  it('resolves "primary site" to PrimarySite rather than dead-ending', () => {
    const r = resolveScope({
      question: 'can you add a guest nbetwork to primary site?',
      inventory: INVENTORY,
    });
    expect(r.needsClarification).toBe(false);
    expect(r.level).toBe('site');
    expect(r.siteNames).toEqual(['PrimarySite']);
  });

  it('matches a camelCase site name typed as two words', () => {
    expect(scoreSiteMatch('primary site', 'PrimarySite')).toBe(100);
    expect(findNamedSites('how is primary site doing?', SITES).map((s) => s.name)).toEqual([
      'PrimarySite',
    ]);
  });

  it('does not find a short site name buried inside an unrelated word', () => {
    // A live estate has a site called EAL. "real", "meal" and "healthy" must
    // not scope an investigation to it.
    const sites = [{ name: 'EAL' }, { name: 'EAL-PT-S' }];
    expect(findNamedSites('is the real problem healthy clients?', sites)).toEqual([]);
    expect(findNamedSites('how is EAL doing?', sites).map((s) => s.name)).toEqual(['EAL']);
  });

  it('still lets an explicitly named unknown site beat a stray fleet word', () => {
    // The contract rule 4 exists for: "any issues at site Boston?" says Boston
    // out loud. That must keep clarifying, not widen to the estate.
    const r = resolveScope({ question: 'any issues at site Boston?', inventory: INVENTORY });
    expect(r.needsClarification).toBe(true);
    expect(r.unresolved).toEqual(['Boston']);
  });

  it('still reads a real "<name> site" reference', () => {
    // The weak pattern has a legitimate job — do not disable it wholesale.
    expect(extractSitePhrase('what is broken at the Boston site?')).toMatch(/boston/i);
  });
});

describe('scope resolution — a common word that happens to be a name', () => {
  it('does not read "a guest network" as the SSID called Guest', () => {
    // An indefinite article means the operator is describing a KIND of thing,
    // not pointing at one that exists. "add a guest network" is a request to
    // create one; "is Guest broadcasting?" is a question about the WLAN.
    expect(findNamedEntity('can you add a guest network to primary site?', INVENTORY)).toBeNull();
    expect(findNamedEntity('is Guest broadcasting?', INVENTORY)).toMatchObject({
      kind: 'wlan',
      value: 'Guest',
    });
  });

  it('scopes a create-a-network request to the site, not to a WLAN', () => {
    const r = resolveScope({
      question: 'can you add a guest nbetwork to primary site?',
      inventory: INVENTORY,
    });
    expect(r.level).toBe('site');
    expect(r.siteNames).toEqual(['PrimarySite']);
  });

  it('does not find a short SSID buried inside an unrelated word', () => {
    const inv = { sites: [], ssids: ['EAL'], apNames: [] };
    expect(findNamedEntity('is the real problem healthy clients?', inv)).toBeNull();
    expect(findNamedEntity('is EAL up?', inv)).toMatchObject({ kind: 'wlan', value: 'EAL' });
  });
});

describe('an unreadable site catalogue', () => {
  const LAB = ['PrimarySite', 'AFC LAB', 'CLONE', 'EAL', 'AURA_LAB', 'EAL-PT-S', 'EAL-PT-N'].map(
    (name) => ({ name })
  );

  it('resolves a named site from the catalogue without asking anything', () => {
    // The reported question. With the catalogue present this is rule 2 and
    // there is nothing to clarify.
    const r = resolveScope({
      question: 'How is Primary site overall?',
      uiScope: {},
      inventory: { sites: LAB, ssids: [], apNames: [] },
    });

    expect(r.level).toBe('site');
    expect(r.siteNames).toEqual(['PrimarySite']);
    expect(r.needsClarification).toBe(false);
  });

  it('never claims a site does not exist when it could not read the catalogue', () => {
    // Observed live: `No site is called "How is Primary"` — a statement about
    // the estate, produced by a read that failed. Same error as treating an
    // empty filter as an empty world.
    const r = resolveScope({
      question: 'How is Primary site overall?',
      uiScope: {},
      inventory: { sites: [], ssids: [], apNames: [] },
    });

    expect(r.reason).not.toMatch(/No site is called/i);
    expect(r.reason).toMatch(/catalogue could not be read/i);
    expect(r.source).toBe('rule4-catalogue-unavailable');
  });

  it('does not ask a question the operator has no way to answer', () => {
    // A clarification with zero candidates is a dead end.
    const r = resolveScope({
      question: 'How is Primary site overall?',
      uiScope: {},
      inventory: { sites: [], ssids: [], apNames: [] },
    });

    expect(r.needsClarification).toBe(false);
    expect(r.candidates ?? []).toHaveLength(0);
  });

  it('says plainly that an estate-wide answer is not the site’s own', () => {
    const r = resolveScope({
      question: 'How is Primary site overall?',
      uiScope: {},
      inventory: { sites: [], ssids: [], apNames: [] },
    });

    expect(r.level).toBe('fleet');
    // The phrase extractor is greedy here ("How is Primary" rather than
    // "Primary"), which only ever surfaces on this degraded path — with a
    // readable catalogue the name matches at rule 2 long before extraction.
    // Asserted as-is so a later tightening of the patterns is a visible change
    // rather than a silent one.
    expect(r.unresolved).toEqual(['How is Primary']);
    expect(r.reason).toMatch(/NOT attributable/i);
  });

  it('still asks when there IS a catalogue and the name matches nothing', () => {
    // The guard must not swallow the real silent-zero case it was built for.
    const r = resolveScope({
      question: 'How is Warehouse site overall?',
      uiScope: {},
      inventory: { sites: LAB, ssids: [], apNames: [] },
    });

    expect(r.needsClarification).toBe(true);
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(r.reason).toMatch(/No site is called/i);
  });
});
