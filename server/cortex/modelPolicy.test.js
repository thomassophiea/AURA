import { describe, it, expect } from 'vitest';
import {
  selectModel,
  estimateCostUsd,
  looksLikeEscalation,
  looksComplex,
  UsageAccumulator,
  DEFAULT_MODEL,
  DEEP_MODEL,
  classifyInvestigationIntent,
} from './modelPolicy.js';

describe('escalation detection', () => {
  it('recognises the operator asking to go deeper', () => {
    for (const q of [
      'go deeper',
      'Go Deeper.',
      'dig deeper on that',
      'run red queen',
      'are you sure?',
      'what am I missing here',
    ]) {
      expect(looksLikeEscalation(q), q).toBe(true);
    }
  });

  it('does not treat an ordinary question as escalation', () => {
    for (const q of [
      'why is this client unhappy?',
      'how many APs are at Aura_Lab?',
      'show me AURA_PSAE',
    ]) {
      expect(looksLikeEscalation(q), q).toBe(false);
    }
  });

  it('ignores non-strings rather than throwing', () => {
    expect(looksLikeEscalation(null)).toBe(false);
    expect(looksLikeEscalation({ go: 'deeper' })).toBe(false);
  });
});

describe('complexity detection', () => {
  it('flags multi-entity and intermittent symptoms', () => {
    expect(looksComplex('Thirty percent of clients across three APs are intermittently dropping'))
      .toBe(true);
    expect(looksComplex('several sites are affected')).toBe(true);
    expect(looksComplex('it happens randomly')).toBe(true);
  });

  it('does not flag a single-client question', () => {
    expect(looksComplex('why is Thomas-iPhone slow')).toBe(false);
  });
});

describe('selectModel', () => {
  it('routes routine troubleshooting to the default tier', () => {
    const r = selectModel({ question: 'why is this client unhappy?', intent: 'TROUBLESHOOTING' });
    expect(r.model).toBe(DEFAULT_MODEL);
    expect(r.tier).toBe('default');
  });

  it('routes an inventory query to the default model at low effort', () => {
    const r = selectModel({ question: 'how many APs are at Aura_Lab?', intent: 'QUERY' });
    expect(r.model).toBe(DEFAULT_MODEL);
    expect(r.effort).toBe('low');
  });

  it('escalates to the deep model when the operator says go deeper', () => {
    const r = selectModel({ question: 'go deeper', intent: 'TROUBLESHOOTING' });
    expect(r.model).toBe(DEEP_MODEL);
    expect(r.tier).toBe('deep');
    expect(r.effort).toBe('xhigh');
  });

  it('escalates for a Red Queen pass regardless of wording', () => {
    const r = selectModel({ question: 'check this', redQueen: true });
    expect(r.model).toBe(DEEP_MODEL);
    expect(r.effort).toBe('xhigh');
  });

  it('escalates a multi-entity intermittent symptom without being asked', () => {
    const r = selectModel({
      question: 'Thirty percent of clients across three APs are intermittently losing Teams calls',
      intent: 'TROUBLESHOOTING',
    });
    expect(r.model).toBe(DEEP_MODEL);
  });

  it('escalates when a prior pass burned its budget without converging', () => {
    const r = selectModel({ intent: 'TROUBLESHOOTING', continuing: true, priorIterations: 7 });
    expect(r.model).toBe(DEEP_MODEL);
    expect(r.reason).toMatch(/7 iterations/);
  });

  it('does not escalate on a short prior pass', () => {
    const r = selectModel({ intent: 'TROUBLESHOOTING', continuing: true, priorIterations: 2 });
    expect(r.model).toBe(DEFAULT_MODEL);
  });

  it('honours an explicit operator model choice over every heuristic', () => {
    const r = selectModel({ question: 'go deeper', requestedModel: 'claude-haiku-4-5' });
    expect(r.model).toBe('claude-haiku-4-5');
    expect(r.reason).toMatch(/explicit/);
  });

  it('gives configuration planning high effort on the default tier', () => {
    const r = selectModel({ question: 'change Aura_PSAE to VLAN 40', intent: 'CONFIGURATION' });
    expect(r.model).toBe(DEFAULT_MODEL);
    expect(r.effort).toBe('high');
  });
});

describe('estimateCostUsd', () => {
  it('prices input and output at the published rate', () => {
    // 1M input + 1M output on Opus 5 = $5 + $25
    const cost = estimateCostUsd(
      { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 },
      'claude-opus-5'
    );
    expect(cost).toBeCloseTo(30.0, 5);
  });

  it('prices Sonnet below Opus for identical usage', () => {
    const usage = { prompt_tokens: 100_000, completion_tokens: 20_000 };
    expect(estimateCostUsd(usage, 'claude-sonnet-5')).toBeLessThan(
      estimateCostUsd(usage, 'claude-opus-5')
    );
  });

  it('bills a cache read at a tenth of the input rate', () => {
    // 1M cache-read tokens on Opus 5 = $5 * 0.1 = $0.50
    const cost = estimateCostUsd(
      { prompt_tokens: 0, completion_tokens: 0, cache_read_input_tokens: 1_000_000 },
      'claude-opus-5'
    );
    expect(cost).toBeCloseTo(0.5, 5);
  });

  it('bills a cache write above the input rate', () => {
    const cost = estimateCostUsd(
      { prompt_tokens: 0, completion_tokens: 0, cache_creation_input_tokens: 1_000_000 },
      'claude-opus-5'
    );
    expect(cost).toBeCloseTo(6.25, 5);
  });

  it('returns null rather than guessing for an unpriced model', () => {
    expect(estimateCostUsd({ prompt_tokens: 1000 }, 'openai/gpt-oss-120b')).toBeNull();
    expect(estimateCostUsd({ prompt_tokens: 1000 }, 'qwen2.5:7b')).toBeNull();
  });

  it('returns null for missing usage', () => {
    expect(estimateCostUsd(null, 'claude-opus-5')).toBeNull();
  });
});

describe('UsageAccumulator', () => {
  it('sums across turns and keeps the per-model split', () => {
    const acc = new UsageAccumulator();
    acc.record('claude-sonnet-5', { prompt_tokens: 1000, completion_tokens: 100 });
    acc.record('claude-sonnet-5', { prompt_tokens: 2000, completion_tokens: 200 });
    acc.record('claude-opus-5', { prompt_tokens: 500, completion_tokens: 50 });

    const s = acc.summary();
    expect(s.promptTokens).toBe(3500);
    expect(s.completionTokens).toBe(350);
    expect(s.turns).toBe(3);
    expect(s.perModel).toHaveLength(2);
    expect(s.estimatedCostUsd).toBeGreaterThan(0);
  });

  it('reports null cost when nothing in the run has a published rate', () => {
    const acc = new UsageAccumulator();
    acc.record('openai/gpt-oss-120b', { prompt_tokens: 5000, completion_tokens: 500 });
    const s = acc.summary();
    expect(s.promptTokens).toBe(5000);
    // null, not 0 — "not priced" must not read as "free".
    expect(s.estimatedCostUsd).toBeNull();
  });

  it('ignores a turn with no usage rather than counting it as zero', () => {
    const acc = new UsageAccumulator();
    acc.record('claude-opus-5', null);
    acc.record('claude-opus-5', { prompt_tokens: 10, completion_tokens: 1 });
    expect(acc.summary().turns).toBe(1);
  });
});

describe('classifyInvestigationIntent', () => {
  it('routes inventory shapes to QUERY so they get the cheap tier', () => {
    for (const q of [
      'How many APs are at AURA_LAB?',
      'how many clients are connected',
      'list the WLANs',
      'show me the access points',
      'which sites have the most clients',
    ]) {
      expect(classifyInvestigationIntent(q), q).toBe('QUERY');
    }
  });

  it('routes conceptual questions to EXPLANATION', () => {
    expect(classifyInvestigationIntent('What is AFC?')).toBe('EXPLANATION');
    expect(classifyInvestigationIntent('explain fast transition')).toBe('EXPLANATION');
  });

  it('keeps anything with a problem word as TROUBLESHOOTING', () => {
    for (const q of [
      'why is this client unhappy?',
      'the wifi is slow',
      'clients keep dropping',
      // A lookup-shaped opening must not win over a problem word: this is
      // troubleshooting wearing a list's clothes.
      'show me why the Guest network keeps dropping',
      'list the APs that are broken',
    ]) {
      expect(classifyInvestigationIntent(q), q).toBe('TROUBLESHOOTING');
    }
  });

  it('defaults to TROUBLESHOOTING on anything ambiguous or empty', () => {
    expect(classifyInvestigationIntent('')).toBe('TROUBLESHOOTING');
    expect(classifyInvestigationIntent(null)).toBe('TROUBLESHOOTING');
    expect(classifyInvestigationIntent('AURA_PSAE')).toBe('TROUBLESHOOTING');
  });

  it('an inventory question really does reach the cheap tier end to end', () => {
    const intent = classifyInvestigationIntent('How many APs are at AURA_LAB?');
    const r = selectModel({ question: 'How many APs are at AURA_LAB?', intent });
    expect(r.model).toBe(DEFAULT_MODEL);
    expect(r.effort).toBe('low');
  });
});
