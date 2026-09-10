import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CortexProviderNotConfiguredError,
  OpenAiLlmProvider,
  AnthropicLlmProvider,
  createLlmProvider,
  createLlmProviderForModel,
  OllamaLlmProvider,
} from './cortexLlmProvider.js';

/**
 * There is deliberately NO mock provider.
 *
 * One previously existed and was the default whenever CORTEX_LLM_PROVIDER was
 * unset or an API key was missing. It emitted telemetry-shaped prose —
 * "Client: N/A (mock mode)", "RF indicators: none (mock mode)" — so an
 * unconfigured deployment answered network questions with invented structure
 * instead of refusing. These tests exist to keep it deleted.
 */
describe('no mock provider exists', () => {
  it('does not export a mock provider', async () => {
    const mod = await import('./cortexLlmProvider.js');
    const names = Object.keys(mod);
    expect(names).not.toContain('MockLlmProvider');
    expect(names.some((n) => /mock/i.test(n))).toBe(false);
  });

  it('throws instead of returning a provider when nothing is configured', () => {
    // The critical assertion: an unconfigured Cortex must FAIL, not answer.
    expect(() => createLlmProvider({})).toThrow(CortexProviderNotConfiguredError);
  });

  it('rejects provider="mock" as unknown', () => {
    expect(() => createLlmProvider({ provider: 'mock' })).toThrow(/Unknown CORTEX_LLM_PROVIDER "mock"/);
  });

  it('carries a 503 status and a machine-readable code', () => {
    try {
      createLlmProvider({});
      throw new Error('expected createLlmProvider to throw');
    } catch (err) {
      expect(err.code).toBe('CORTEX_PROVIDER_NOT_CONFIGURED');
      expect(err.status).toBe(503);
    }
  });

  it('says plainly that there is no mock fallback', () => {
    // The message reaches an operator, so it must name the cause and the fix.
    expect(() => createLlmProvider({})).toThrow(/CORTEX_LLM_PROVIDER/);
    expect(() => createLlmProvider({})).toThrow(/no mock fallback/i);
  });
});

describe('createLlmProvider', () => {
  it('throws when groq is selected but no key is present', () => {
    expect(() => createLlmProvider({ provider: 'groq' })).toThrow(
      /neither GROQ_API_KEY nor GROK_API_KEY is set/
    );
  });

  it('throws when openai is selected but no key is present', () => {
    expect(() => createLlmProvider({ provider: 'openai' })).toThrow(/OPENAI_API_KEY is not set/);
  });

  it('throws when anthropic is selected but no key is present', () => {
    expect(() => createLlmProvider({ provider: 'anthropic' })).toThrow(
      /neither ANTHROPIC_API_KEY nor CLAUDE_API_KEY is set/
    );
  });

  it('routes provider=grok to Groq Cloud when key has gsk_ prefix', () => {
    const { provider, defaultModel } = createLlmProvider({
      provider: 'grok',
      apiKey: 'gsk_TESTKEY123',
    });
    expect(provider).toBeInstanceOf(OpenAiLlmProvider);
    // Measured 2026-09-10: every llama-3.x id Groq used to serve is retired.
    expect(defaultModel).toBe('openai/gpt-oss-120b');
  });

  it('routes provider=groq to xAI Grok when key has xai- prefix', () => {
    const { provider, defaultModel } = createLlmProvider({
      provider: 'groq',
      apiKey: 'xai-TESTKEY123',
    });
    expect(provider).toBeInstanceOf(OpenAiLlmProvider);
    expect(defaultModel).toBe('grok-3');
  });

  it('keeps provider=grok with non-gsk_ key (assumes xAI)', () => {
    const { defaultModel } = createLlmProvider({ provider: 'grok', apiKey: 'xai-TESTKEY123' });
    expect(defaultModel).toBe('grok-3');
  });

  it('keeps provider=groq with gsk_ key', () => {
    const { defaultModel } = createLlmProvider({ provider: 'groq', apiKey: 'gsk_TESTKEY123' });
    expect(defaultModel).toBe('openai/gpt-oss-120b');
  });

  it('returns AnthropicLlmProvider for provider=anthropic with sk-ant key', () => {
    const { provider, defaultModel } = createLlmProvider({
      provider: 'anthropic',
      apiKey: 'sk-ant-FAKE',
    });
    expect(provider).toBeInstanceOf(AnthropicLlmProvider);
    expect(defaultModel).toBe('claude-opus-5');
  });

  it('accepts provider=claude alias', () => {
    const { provider } = createLlmProvider({ provider: 'claude', apiKey: 'sk-ant-FAKE' });
    expect(provider).toBeInstanceOf(AnthropicLlmProvider);
  });

  it('auto-routes sk-ant key to Anthropic even when provider=grok', () => {
    const { provider, defaultModel } = createLlmProvider({
      provider: 'grok',
      apiKey: 'sk-ant-FAKE',
    });
    expect(provider).toBeInstanceOf(AnthropicLlmProvider);
    expect(defaultModel).toBe('claude-opus-5');
  });
});

describe('createLlmProviderForModel', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    for (const k of [
      'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'OPENAI_API_KEY', 'GROQ_API_KEY',
      'GROK_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'MISTRAL_API_KEY',
      'CEREBRAS_API_KEY', 'DEEPSEEK_API_KEY', 'OLLAMA_ENABLED', 'OLLAMA_API_BASE',
    ]) delete process.env[k];
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('throws on an unknown model id', () => {
    expect(() => createLlmProviderForModel('not-a-real-model')).toThrow(/not found/i);
  });

  it('instantiates an Anthropic provider for a Claude model id', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-FAKE';
    const { provider, model, providerName } = createLlmProviderForModel('claude-opus-5');
    expect(provider).toBeInstanceOf(AnthropicLlmProvider);
    expect(model).toBe('claude-opus-5');
    expect(providerName).toBe('anthropic');
  });

  it('instantiates an OpenAI-compatible provider for a Gemini model id', () => {
    process.env.GEMINI_API_KEY = 'gem-FAKE';
    const { provider, providerName } = createLlmProviderForModel('gemini-1.5-pro');
    expect(provider).toBeInstanceOf(OpenAiLlmProvider);
    expect(providerName).toBe('gemini');
  });

  it('throws when the model exists but its key env is unset', () => {
    expect(() => createLlmProviderForModel('mistral-small-latest')).toThrow(/MISTRAL_API_KEY/);
  });

  it('routes a Cerebras model id to CEREBRAS_API_KEY', () => {
    process.env.CEREBRAS_API_KEY = 'cere-FAKE';
    const { providerName } = createLlmProviderForModel('llama3.3-70b');
    expect(providerName).toBe('cerebras');
  });

  it('routes a DeepSeek model id to DEEPSEEK_API_KEY', () => {
    process.env.DEEPSEEK_API_KEY = 'ds-FAKE';
    const { providerName } = createLlmProviderForModel('deepseek-reasoner');
    expect(providerName).toBe('deepseek');
  });

  it('routes a discovered Ollama id to the NATIVE provider, not the /v1 shim', () => {
    // Measured: Ollama's OpenAI-compatible shim returns no structured
    // tool_calls, so routing Cortex through OpenAiLlmProvider silently turned
    // a tool request into a final answer.
    process.env.OLLAMA_ENABLED = 'true';
    const { provider, providerName } = createLlmProviderForModel('llama3.2', ['llama3.2']);
    expect(provider).toBeInstanceOf(OllamaLlmProvider);
    expect(provider).not.toBeInstanceOf(OpenAiLlmProvider);
    expect(providerName).toBe('ollama');
  });
});

describe('AnthropicLlmProvider message translation', () => {
  // Use a fake fetch so we can inspect what the SDK posts to /v1/messages
  // without actually hitting Anthropic.
  let originalFetch;
  let lastBody;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    lastBody = null;
    globalThis.fetch = async (_url, init) => {
      lastBody = JSON.parse(init?.body ?? '{}');
      return new Response(
        JSON.stringify({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-5',
          content: [{ type: 'text', text: 'ok' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('extracts the system prompt as a top-level cached system field', async () => {
    const p = new AnthropicLlmProvider({ apiKey: 'sk-ant-FAKE' });
    await p.generateResponse({
      model: 'claude-opus-5',
      messages: [
        { role: 'system', content: 'You are Cortex.' },
        { role: 'user', content: 'hi' },
      ],
    });
    expect(Array.isArray(lastBody.system)).toBe(true);
    expect(lastBody.system[0].text).toBe('You are Cortex.');
    expect(lastBody.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(lastBody.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it.each(['claude-opus-5', 'claude-sonnet-5', 'claude-opus-4-8', 'claude-opus-4-7'])(
    'omits temperature on %s (sampling params removed — 400 if sent)',
    async (model) => {
      // This was a denylist that only excluded claude-opus-4-7, so every newer
      // model — including claude-opus-5 — got temperature and 400'd.
      const p = new AnthropicLlmProvider({ apiKey: 'sk-ant-FAKE' });
      await p.generateResponse({
        model,
        messages: [{ role: 'user', content: 'hi' }],
        temperature: 0.5,
      });
      expect(lastBody.temperature).toBeUndefined();
    }
  );

  it('omits temperature for an unrecognised model, failing safe', async () => {
    const p = new AnthropicLlmProvider({ apiKey: 'sk-ant-FAKE' });
    await p.generateResponse({
      model: 'claude-something-future-9',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.5,
    });
    expect(lastBody.temperature).toBeUndefined();
  });

  it('still sends temperature on a model that accepts it', async () => {
    const p = new AnthropicLlmProvider({ apiKey: 'sk-ant-FAKE' });
    await p.generateResponse({
      model: 'claude-haiku-4-5',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.5,
    });
    expect(lastBody.temperature).toBe(0.5);
  });

  it('never sends budget_tokens, which 400s on the current generation', async () => {
    const p = new AnthropicLlmProvider({ apiKey: 'sk-ant-FAKE' });
    await p.generateResponse({
      model: 'claude-opus-5',
      messages: [{ role: 'user', content: 'hi' }],
    });
    // Omitting `thinking` entirely runs adaptive thinking on Opus 5, which is
    // what we want; budget_tokens is rejected outright.
    expect(lastBody.thinking).toBeUndefined();
  });

  it('keeps temperature on Sonnet 4.6, which still accepts it', async () => {
    // Sonnet 4.6 is one of the models on the ACCEPTS_SAMPLING allowlist, so
    // this case must keep its original model id — it is the counterexample
    // that proves the allowlist is not simply dropping temperature always.
    const p = new AnthropicLlmProvider({ apiKey: 'sk-ant-FAKE' });
    await p.generateResponse({
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.5,
    });
    expect(lastBody.temperature).toBe(0.5);
  });

  it('translates assistant tool_calls and tool messages into tool_use / tool_result blocks', async () => {
    const p = new AnthropicLlmProvider({ apiKey: 'sk-ant-FAKE' });
    await p.generateResponse({
      model: 'claude-opus-5',
      messages: [
        { role: 'user', content: 'which sites are unhealthy?' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'listSites', arguments: '{}' },
            },
          ],
        },
        { role: 'tool', tool_call_id: 'call-1', name: 'listSites', content: '[{"id":"s-1"}]' },
        { role: 'tool', tool_call_id: 'call-1', name: 'listSites', content: 'extra' },
      ],
    });
    // user turn, assistant turn with tool_use, then ONE user turn with both tool_results merged
    expect(lastBody.messages).toHaveLength(3);
    expect(lastBody.messages[1].content[0]).toMatchObject({ type: 'tool_use', name: 'listSites' });
    expect(lastBody.messages[2].role).toBe('user');
    expect(lastBody.messages[2].content).toHaveLength(2);
    expect(lastBody.messages[2].content[0].type).toBe('tool_result');
  });

  it('converts tools[*].parameters → tools[*].input_schema', async () => {
    const p = new AnthropicLlmProvider({ apiKey: 'sk-ant-FAKE' });
    await p.generateResponse({
      model: 'claude-opus-5',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [
        {
          name: 'listSites',
          description: 'list sites',
          parameters: { type: 'object', properties: {} },
        },
      ],
    });
    expect(lastBody.tools).toEqual([
      {
        name: 'listSites',
        description: 'list sites',
        input_schema: { type: 'object', properties: {} },
      },
    ]);
  });
});

import { sanitizeCortexContext } from './cortexContextSanitizer.js';

describe('sanitizeCortexContext', () => {
  it('redacts top-level sensitive string fields', () => {
    const ctx = {
      route: 'configure-networks',
      pageName: 'Configure Networks',
      pageType: 'configuration',
      filters: {
        psk: 'mysecret123',
        password: 'hunter2',
        timeRange: '24h',
      },
    };
    const result = sanitizeCortexContext(ctx);
    expect(result.filters.psk).toBe('[REDACTED]');
    expect(result.filters.password).toBe('[REDACTED]');
    expect(result.filters.timeRange).toBe('24h');
  });

  it('does not mutate the original context', () => {
    const ctx = { filters: { psk: 'secret' } };
    sanitizeCortexContext(ctx);
    expect(ctx.filters.psk).toBe('secret');
  });

  it('redacts in selectedObject', () => {
    const ctx = {
      selectedObject: { name: 'SSID-Corp', psk: 'p@ssw0rd', ssid: 'Corp-WiFi' },
    };
    const result = sanitizeCortexContext(ctx);
    expect(result.selectedObject.psk).toBe('[REDACTED]');
    expect(result.selectedObject.name).toBe('SSID-Corp');
  });

  it('handles null/undefined context gracefully', () => {
    expect(sanitizeCortexContext(null)).toBeNull();
    expect(sanitizeCortexContext(undefined)).toBeUndefined();
  });

  it('truncates visibleRowsSummary sampleRows to 5', () => {
    const ctx = {
      visibleRowsSummary: {
        rowCount: 100,
        columns: ['mac', 'rssi'],
        sampleRows: Array.from({ length: 20 }, (_, i) => ({ mac: `00:${i}`, rssi: -70 })),
      },
    };
    const result = sanitizeCortexContext(ctx);
    expect(result.visibleRowsSummary.sampleRows.length).toBe(5);
    expect(result.visibleRowsSummary.rowCount).toBe(100);
  });
});
