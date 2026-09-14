import { describe, it, expect } from 'vitest';
import { runInvestigation } from './investigationAgent.js';

/**
 * End-to-end wiring, without a live provider.
 *
 * These assert the things that are easy to get wrong and impossible to notice:
 * that `effort` actually reaches the provider call, that `redQueen` actually
 * changes the system prompt the model receives, and that usage is actually
 * accumulated per model rather than silently dropped.
 *
 * The recording provider is a TEST DOUBLE and lives here, in a test file —
 * never in the shipped provider factory. A mock provider used to ship in
 * cortexLlmProvider.js and it fabricated telemetry-shaped prose; it was deleted
 * deliberately. This one only records what it was asked for and returns a fixed
 * string.
 */
function recordingProvider({ usage, turns = 1 } = {}) {
  const calls = [];
  let n = 0;
  return {
    calls,
    async generateResponse(params) {
      calls.push(params);
      n += 1;
      return {
        message: n >= turns ? 'The client is associated with healthy RF.' : '',
        usage: usage ?? { prompt_tokens: 100, completion_tokens: 20 },
      };
    },
  };
}

const capabilities = { unusableKeys: () => ['ap.reboot_reason'] };
const noTools = {};

describe('effort reaches the provider', () => {
  it('passes the chosen effort through to every turn', async () => {
    const provider = recordingProvider();
    await runInvestigation({
      provider,
      model: 'claude-sonnet-5',
      tools: noTools,
      capabilities,
      question: 'why is this client unhappy?',
      effort: 'xhigh',
    });
    expect(provider.calls.length).toBeGreaterThan(0);
    expect(provider.calls[0].effort).toBe('xhigh');
  });

  it('leaves effort undefined when none was chosen', async () => {
    const provider = recordingProvider();
    await runInvestigation({
      provider,
      model: 'claude-sonnet-5',
      tools: noTools,
      capabilities,
      question: 'hello',
    });
    expect(provider.calls[0].effort).toBeUndefined();
  });
});

describe('redQueen reaches the system prompt', () => {
  it('injects the adversarial directive and widens the answer budget', async () => {
    const provider = recordingProvider();
    await runInvestigation({
      provider,
      model: 'claude-opus-5',
      tools: noTools,
      capabilities,
      question: 'go deeper',
      redQueen: true,
    });
    const system = provider.calls[0].messages.find((m) => m.role === 'system');
    expect(system.content).toMatch(/RED QUEEN — ADVERSARIAL REVIEW/);
    // Red Queen has to be able to reach further than the pass it reviews.
    expect(provider.calls[0].maxTokens).toBe(2400);
  });

  it('omits the directive on a normal pass', async () => {
    const provider = recordingProvider();
    await runInvestigation({
      provider,
      model: 'claude-sonnet-5',
      tools: noTools,
      capabilities,
      question: 'why is this client unhappy?',
    });
    const system = provider.calls[0].messages.find((m) => m.role === 'system');
    expect(system.content).not.toMatch(/RED QUEEN/);
    expect(provider.calls[0].maxTokens).toBe(1400);
  });
});

describe('the methodology reaches the model on a real run', () => {
  it('carries the ordering rule and the sentinels into the system message', async () => {
    const provider = recordingProvider();
    await runInvestigation({
      provider,
      model: 'claude-sonnet-5',
      tools: noTools,
      capabilities,
      question: 'the wifi is slow',
    });
    const system = provider.calls[0].messages.find((m) => m.role === 'system');
    expect(system.content).toMatch(/plumbing -> RF -> client/);
    expect(system.content).toMatch(/65535/);
    expect(system.content).toMatch(/Say "Gateway", never "controller"/);
  });

  it('adds question-specific guidance when the question warrants it', async () => {
    const provider = recordingProvider();
    await runInvestigation({
      provider,
      model: 'claude-sonnet-5',
      tools: noTools,
      capabilities,
      question: 'nobody can authenticate this morning',
    });
    const system = provider.calls[0].messages.find((m) => m.role === 'system');
    expect(system.content).toMatch(/GUIDANCE FOR THIS QUESTION/);
    expect(system.content).toMatch(/check NTP first/i);
  });
});

describe('usage accounting', () => {
  it('accumulates cost per model rather than dropping it', async () => {
    const provider = recordingProvider({
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 200,
        cache_read_input_tokens: 5000,
        cache_creation_input_tokens: 100,
      },
    });
    const r = await runInvestigation({
      provider,
      model: 'claude-sonnet-5',
      tools: noTools,
      capabilities,
      question: 'why is this client unhappy?',
    });

    // The flat totals the existing callers read.
    expect(r.usage.promptTokens).toBe(1000);
    expect(r.usage.completionTokens).toBe(200);

    // The per-model split and the priced total.
    expect(r.cost.promptTokens).toBe(1000);
    expect(r.cost.cacheReadTokens).toBe(5000);
    expect(r.cost.perModel).toHaveLength(1);
    expect(r.cost.perModel[0].model).toBe('claude-sonnet-5');
    expect(r.cost.estimatedCostUsd).toBeGreaterThan(0);
  });

  it('reports cost as null — not zero — for an unpriced provider', async () => {
    const provider = recordingProvider();
    const r = await runInvestigation({
      provider,
      model: 'openai/gpt-oss-120b',
      tools: noTools,
      capabilities,
      question: 'hello',
    });
    expect(r.cost.promptTokens).toBe(100);
    // "not priced" must never read as "free".
    expect(r.cost.estimatedCostUsd).toBeNull();
  });

  it('does not invent usage when the provider reports none', async () => {
    const provider = {
      async generateResponse() {
        return { message: 'done' };
      },
    };
    const r = await runInvestigation({
      provider,
      model: 'claude-sonnet-5',
      tools: noTools,
      capabilities,
      question: 'hello',
    });
    expect(r.cost.turns).toBe(0);
    expect(r.cost.estimatedCostUsd).toBeNull();
  });
});

describe('a provider failure is never a statement about the network', () => {
  it('returns providerError and an empty answer rather than a diagnosis', async () => {
    const provider = {
      async generateResponse() {
        throw new Error('Anthropic 401: the API key was rejected.');
      },
    };
    const r = await runInvestigation({
      provider,
      model: 'claude-sonnet-5',
      tools: noTools,
      capabilities,
      question: 'why is this client unhappy?',
    });
    expect(r.answer).toBe('');
    expect(r.providerError).toMatch(/401/);
    expect(r.stoppedBecause).toBe('provider_error');
  });
});
