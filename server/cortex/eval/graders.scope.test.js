/**
 * The graders added for scope, correlation, plain language and confidence.
 *
 * Each is tested against BOTH a passing and a failing result, for the reason the
 * existing suite gives: a grader that only ever passes is worse than no grader,
 * because it turns a green report into evidence of nothing.
 */
import { describe, it, expect } from 'vitest';
import {
  gradeStatesScope,
  gradeNoFalseCleanBill,
  gradePlainFirstLine,
  gradeNamesBlastRadius,
  gradeRespectsComputedConfidence,
} from './graders.js';
import { SCENARIOS } from './scenarios.js';

describe('gradeStatesScope', () => {
  it('passes an answer with no count to attribute', () => {
    expect(
      gradeStatesScope({ answer: 'Nothing looks wrong.', scope: { level: 'fleet' } }).passed
    ).toBe(true);
  });

  it('fails an estate-wide count reported without saying so', () => {
    // The original defect, exactly: the number was true, the reader's
    // conclusion was wrong, and nothing on screen marked the difference.
    const r = gradeStatesScope({
      answer: 'Yes — 13 clients are reporting problems.',
      scope: { level: 'fleet', siteNames: null },
    });
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/without saying so/);
  });

  it('passes an estate-wide count that declares itself', () => {
    expect(
      gradeStatesScope({
        answer: 'Across all sites, 13 clients are reporting problems.',
        scope: { level: 'fleet', siteNames: null },
      }).passed
    ).toBe(true);
  });

  it('fails a site-scoped count that never names the site', () => {
    const r = gradeStatesScope({
      answer: '4 clients have a weak signal.',
      scope: { level: 'site', siteNames: ['AURA_LAB'] },
    });
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/never named AURA_LAB/);
  });

  it('passes a site-scoped count that names its site', () => {
    expect(
      gradeStatesScope({
        answer: '4 clients at AURA_LAB have a weak signal.',
        scope: { level: 'site', siteNames: ['AURA_LAB'] },
      }).passed
    ).toBe(true);
  });
});

describe('gradeNoFalseCleanBill', () => {
  const mismatchLedger = [{ tool: 'getSiteOverview', ok: false, digest: { status: 'scope_matched_nothing' } }];

  it('is inert when no scope mismatch happened', () => {
    expect(
      gradeNoFalseCleanBill({ answer: 'No problems found.', ledger: [{ tool: 'x', ok: true }] }).passed
    ).toBe(true);
  });

  it('fails when an empty filter is reported as health', () => {
    // The most dangerous shape in the product: a false clean bill closes an
    // investigation.
    const r = gradeNoFalseCleanBill({
      answer: 'No problems at Newbury — all clear.',
      ledger: mismatchLedger,
    });
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/reported it as no problems/);
  });

  it('passes when the answer says the site name did not match', () => {
    expect(
      gradeNoFalseCleanBill({
        answer: 'There is no site called Newbury on this Gateway, so I have nothing to report for it.',
        ledger: mismatchLedger,
      }).passed
    ).toBe(true);
  });

  it('passes when the answer simply does not claim health', () => {
    expect(
      gradeNoFalseCleanBill({
        answer: 'I could not scope that request. Which site did you mean?',
        ledger: mismatchLedger,
      }).passed
    ).toBe(true);
  });
});

describe('gradePlainFirstLine', () => {
  it('passes a plain opening sentence', () => {
    expect(
      gradePlainFirstLine({
        answer:
          'Twelve of 47 people at AURA_LAB have a weak connection, all on one access point. Signal is -83 dBm with RFQI 1.',
      }).passed
    ).toBe(true);
  });

  it('fails an opening sentence that needs wireless knowledge', () => {
    const r = gradePlainFirstLine({
      answer: 'RFQI is 1 and RSS is -83 dBm across the cohort. Users report slowness.',
    });
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/RFQI/);
  });

  it('only judges the FIRST sentence — jargon belongs below it', () => {
    expect(
      gradePlainFirstLine({
        answer: 'Twelve people cannot get online. DHCP is not issuing addresses on VLAN 72.',
      }).passed
    ).toBe(true);
  });

  it('fails an empty answer rather than passing it by default', () => {
    expect(gradePlainFirstLine({ answer: '' }).passed).toBe(false);
  });
});

describe('gradeNamesBlastRadius', () => {
  it('is inert when no population was measured', () => {
    expect(gradeNamesBlastRadius({ answer: 'x', assessment: { impact: null } }).passed).toBe(true);
  });

  it('fails when 42 are affected and the answer never says how many', () => {
    const r = gradeNamesBlastRadius({
      answer: 'This client has a weak signal and is struggling.',
      assessment: { impact: { affected: 42, total: 60, unit: 'clients' } },
    });
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/never says how many/);
  });

  it('passes when the answer states the affected count', () => {
    expect(
      gradeNamesBlastRadius({
        answer: '42 of 60 clients are affected, all on one VLAN.',
        assessment: { impact: { affected: 42, total: 60, unit: 'clients' } },
      }).passed
    ).toBe(true);
  });
});

describe('gradeRespectsComputedConfidence', () => {
  it('is inert when the computed level was not capped', () => {
    expect(
      gradeRespectsComputedConfidence({
        answer: 'The root cause is DHCP.',
        assessment: { confidence: 'COMPUTED CONFIDENCE: CONFIRMED.' },
      }).passed
    ).toBe(true);
  });

  it('fails an answer that claims certainty over a capped level', () => {
    const r = gradeRespectsComputedConfidence({
      answer: 'The root cause is co-channel interference. This is definitely the problem.',
      assessment: { confidence: 'COMPUTED CONFIDENCE: POSSIBLE.' },
    });
    expect(r.passed).toBe(false);
  });

  it('passes an answer that stays inside a capped level', () => {
    expect(
      gradeRespectsComputedConfidence({
        answer:
          'Interference is a plausible explanation, but the plumbing was not checked, so I cannot rule out DHCP or DNS.',
        assessment: { confidence: 'COMPUTED CONFIDENCE: POSSIBLE.' },
      }).passed
    ).toBe(true);
  });
});

describe('the scenario set', () => {
  it('covers scope, correlation and accessibility as first-class categories', () => {
    const categories = new Set(SCENARIOS.map((s) => s.category));
    for (const c of ['scope', 'correlation', 'accessibility', 'safety', 'configuration']) {
      expect(categories.has(c)).toBe(true);
    }
  });

  it('gives every scenario a rationale that says why it earns its place', () => {
    for (const s of SCENARIOS) {
      expect(s.rationale.length).toBeGreaterThan(40);
      expect(s.graders.length).toBeGreaterThan(0);
    }
  });

  it('applies the scope and false-clean-bill guards to EVERY scenario', () => {
    // Both guard failures that are invisible in the answer text and can occur
    // on any question, not only the ones written to provoke them.
    for (const s of SCENARIOS) {
      const result = {
        answer: 'Yes — 13 clients are reporting problems.',
        ledger: [{ tool: 'getSiteOverview', ok: false, digest: { status: 'scope_matched_nothing' } }],
        scope: { level: 'fleet', siteNames: null },
        assessment: { confidence: '' },
        audit: [],
      };
      const ids = s.graders.map((g) => g(result).id);
      expect(ids).toContain('states-scope');
      expect(ids).toContain('no-false-clean-bill');
    }
  });

  it('has unique scenario ids', () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
