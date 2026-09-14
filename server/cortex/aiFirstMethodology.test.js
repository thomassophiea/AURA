import { describe, it, expect } from 'vitest';
import {
  buildMethodologyBlock,
  buildGuidanceBlock,
  retrieveGuidance,
  GUIDANCE_NOTES,
} from './aiFirstMethodology.js';
import { buildSystemPrompt, RED_QUEEN_DIRECTIVE } from './investigationAgent.js';

/** A capability registry stub — buildSystemPrompt only calls unusableKeys(). */
const capabilities = { unusableKeys: () => ['ap.reboot_reason', 'client.roam_duration'] };

describe('methodology block', () => {
  const block = buildMethodologyBlock();

  it('carries the plumbing-first ordering rule', () => {
    expect(block).toMatch(/plumbing -> RF -> client/);
    expect(block).toMatch(/Check the plumbing BEFORE any radio scoring/i);
  });

  it('names NTP as the symptomless fleet-wide auth breaker', () => {
    // The one that burns days: clock skew invalidates certificate validity
    // windows, so auth fails with no RF symptom at all.
    expect(block).toMatch(/NTP/);
    expect(block).toMatch(/no RF symptom/i);
  });

  it('carries the coverage-vs-contention discriminator with opposite fixes', () => {
    expect(block).toMatch(/weak signal.*low RFQI\s*->\s*COVERAGE/is);
    expect(block).toMatch(/healthy signal.*low RFQI\s*->\s*CONTENTION/is);
    expect(block).toMatch(/Moving the AP makes it worse/i);
  });

  it('carries every sentinel that makes this telemetry lie while returning 200', () => {
    expect(block).toMatch(/65535/);
    expect(block).toMatch(/NOT MEASURED/);
    expect(block).toMatch(/-10000/);
    expect(block).toMatch(/troubles\[\] is EMPTY/i);
    expect(block).toMatch(/DLRetryAttempts is 0/i);
    expect(block).toMatch(/ChannelUtilizationAdjusted is the CO-CHANNEL component/i);
    expect(block).toMatch(/empty poll table means UNCONFIGURED/i);
  });

  it('states the 3-hour telemetry window as a hard boundary', () => {
    expect(block).toMatch(/3 HOURS/);
  });

  it('states what the platform cannot answer rather than softening it', () => {
    expect(block).toMatch(/Can they reach the internet/i);
    expect(block).toMatch(/sees to the AP and no further/i);
    expect(block).toMatch(/RADIUS reject reasons.*not|No.*RADIUS reject/is);
  });

  it('forbids inventing a numeric probability', () => {
    expect(block).toMatch(/LOW \/ MEDIUM \/ HIGH/);
    expect(block).toMatch(/Never invent a numeric probability/i);
  });

  it('requires three peers before a cohort verdict', () => {
    expect(block).toMatch(/smaller than THREE peers/i);
    expect(block).toMatch(/too few peers to judge/i);
  });

  it('enforces the product vocabulary', () => {
    expect(block).toMatch(/Say "Gateway", never "controller"/);
    expect(block).toMatch(/Site Group = the Gateway boundary/);
    expect(block).toMatch(/A WLAN is a configuration object.*An SSID is the broadcast name/is);
  });

  it('states that a success status is not proof a write applied', () => {
    expect(block).toMatch(/does NOT mean applied/i);
    expect(block).toMatch(/REQUEST ACCEPTED and STATE VERIFIED are different/i);
  });

  it('can omit write discipline for a read-only surface', () => {
    const readOnly = buildMethodologyBlock({ includeWriteDiscipline: false });
    expect(readOnly).not.toMatch(/CONFIGURATION WRITES/);
    expect(readOnly).toMatch(/plumbing -> RF -> client/);
  });
});

describe('guidance retrieval', () => {
  it('selects the broadcast ladder for a not-broadcasting question', () => {
    const notes = retrieveGuidance('the Guest SSID is not broadcasting');
    expect(notes.map((n) => n.id)).toContain('ssid-not-broadcasting');
    expect(notes[0].guidance).toMatch(/STOP at the first that fails/i);
    expect(notes[0].guidance).toMatch(/index 0 is invalid/i);
  });

  it('selects auth guidance and leads with NTP', () => {
    const notes = retrieveGuidance('nobody can authenticate this morning');
    const auth = notes.find((n) => n.id === 'auth-failure');
    expect(auth).toBeTruthy();
    expect(auth.guidance).toMatch(/check NTP first/i);
  });

  it('selects the 3-hour caveat for a what-changed question', () => {
    const notes = retrieveGuidance('what changed since yesterday?');
    const changed = notes.find((n) => n.id === 'what-changed');
    expect(changed).toBeTruthy();
    expect(changed.guidance).toMatch(/does not reach back/i);
  });

  it('selects scope guidance for a blast-radius question', () => {
    const notes = retrieveGuidance('is it just me or is everyone affected?');
    expect(notes.map((n) => n.id)).toContain('scope-the-problem');
  });

  it('selects configuration discipline for a change request', () => {
    const notes = retrieveGuidance('change the Guest WLAN to VLAN 40');
    const cfg = notes.find((n) => n.id === 'configuration-change');
    expect(cfg).toBeTruthy();
    expect(cfg.guidance).toMatch(/READ BACK/);
  });

  it('returns nothing for a question that needs no special discipline', () => {
    expect(retrieveGuidance('how many APs are at Aura_Lab?')).toEqual([]);
    expect(buildGuidanceBlock('how many APs are at Aura_Lab?')).toBe('');
  });

  it('caps how many notes are carried', () => {
    // A question can plausibly hit several patterns; the prompt must not grow
    // without bound because someone wrote a paragraph.
    const wordy =
      'the ssid is not broadcasting and nobody can authenticate and what changed ' +
      'since yesterday and is it just me and there is interference and roaming ' +
      'problems and the AP keeps rebooting';
    expect(retrieveGuidance(wordy).length).toBeLessThanOrEqual(3);
  });

  it('ignores non-string input rather than throwing', () => {
    expect(retrieveGuidance(null)).toEqual([]);
    expect(retrieveGuidance('')).toEqual([]);
    expect(retrieveGuidance({ q: 'broadcasting' })).toEqual([]);
  });

  it('every note has a distinct id', () => {
    const ids = GUIDANCE_NOTES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('buildSystemPrompt composition', () => {
  it('embeds the methodology in the prompt the model actually receives', () => {
    const prompt = buildSystemPrompt({
      capabilities,
      toolNames: ['findClient', 'diagnoseClient'],
      question: 'why is this client unhappy?',
    });
    expect(prompt).toMatch(/plumbing -> RF -> client/);
    expect(prompt).toMatch(/65535/);
    expect(prompt).toMatch(/Say "Gateway", never "controller"/);
  });

  it('keeps the pre-existing evidence-discipline rules intact', () => {
    // These predate this change and are the anti-fabrication core — a
    // regression here would be silent and severe.
    const prompt = buildSystemPrompt({ capabilities, toolNames: ['findClient'] });
    expect(prompt).toMatch(/EVIDENCE DISCIPLINE/);
    expect(prompt).toMatch(/observed|inferred|unknown/);
    expect(prompt).toMatch(/fetch_failed/);
    expect(prompt).toMatch(/<<network-data>>/);
    expect(prompt).toMatch(/UNTRUSTED DATA/);
  });

  it('adds question-specific guidance only when it matches', () => {
    const broadcasting = buildSystemPrompt({
      capabilities,
      toolNames: ['getWlanConfig'],
      question: 'Guest is not broadcasting',
    });
    expect(broadcasting).toMatch(/GUIDANCE FOR THIS QUESTION/);
    expect(broadcasting).toMatch(/STOP at the first that fails/i);

    const plain = buildSystemPrompt({
      capabilities,
      toolNames: ['getWlanConfig'],
      question: 'how many APs are at Aura_Lab?',
    });
    expect(plain).not.toMatch(/GUIDANCE FOR THIS QUESTION/);
  });

  it('includes the Red Queen directive only when the adversarial pass is requested', () => {
    const normal = buildSystemPrompt({ capabilities, toolNames: ['findClient'] });
    expect(normal).not.toMatch(/RED QUEEN/);

    const adversarial = buildSystemPrompt({
      capabilities,
      toolNames: ['findClient'],
      redQueen: true,
    });
    expect(adversarial).toMatch(/RED QUEEN — ADVERSARIAL REVIEW/);
  });
});

describe('RED_QUEEN_DIRECTIVE', () => {
  it('requires discriminating evidence, not a longer restatement', () => {
    expect(RED_QUEEN_DIRECTIVE).toMatch(/try to break it, not to restate it/i);
    expect(RED_QUEEN_DIRECTIVE).toMatch(/discriminating/i);
    expect(RED_QUEEN_DIRECTIVE).toMatch(/Padding is not/i);
  });

  it('allows "survived" as a legitimate outcome', () => {
    // An adversarial pass that can only ever overturn the diagnosis is not a
    // review, it is a second guess.
    expect(RED_QUEEN_DIRECTIVE).toMatch(/SURVIVED/);
    expect(RED_QUEEN_DIRECTIVE).toMatch(/UNDETERMINED/);
  });

  it('names concrete alternatives from this platform, not generic ones', () => {
    // \s+ rather than a literal space: the directive is a wrapped template
    // literal, so a phrase can straddle a newline plus indentation.
    expect(RED_QUEEN_DIRECTIVE).toMatch(/sentinel\s+misread\s+as\s+a\s+measurement/i);
    expect(RED_QUEEN_DIRECTIVE).toMatch(/demand\s+mistaken\s+for\s+impairment/i);
    expect(RED_QUEEN_DIRECTIVE).toMatch(/cohort\s+too\s+small/i);
  });
});
