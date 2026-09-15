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
