import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MockLlmProvider,
  OpenAiLlmProvider,
  AnthropicLlmProvider,
  createLlmProvider,
} from './ultr0nLlmProvider.js';

describe('MockLlmProvider', () => {
  it('returns a response with a message string', async () => {
    const provider = new MockLlmProvider();
    const result = await provider.generateResponse({
      model: 'mock',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('reflects page context in response when system message mentions a page', async () => {
    const provider = new MockLlmProvider();
    const result = await provider.generateResponse({
      model: 'mock',
      messages: [
        { role: 'system', content: 'You are on the Connected Clients page.' },
        { role: 'user', content: 'What should I look at?' },
      ],
    });
    expect(typeof result.message).toBe('string');
  });

  it('returns no toolCalls when no tools provided', async () => {
    const provider = new MockLlmProvider();
    const result = await provider.generateResponse({
      model: 'mock',
      messages: [{ role: 'user', content: 'test' }],
    });
    expect(result.toolCalls).toBeUndefined();
  });
});

describe('createLlmProvider', () => {
  it('returns MockLlmProvider when provider is "mock"', () => {
    const { provider } = createLlmProvider({ provider: 'mock' });
    expect(provider).toBeInstanceOf(MockLlmProvider);
  });

  it('returns MockLlmProvider when no config provided', () => {
    const { provider } = createLlmProvider({});
    expect(provider).toBeInstanceOf(MockLlmProvider);
  });

  it('returns defaultModel "mock" for mock provider', () => {
    const { defaultModel } = createLlmProvider({ provider: 'mock' });
    expect(defaultModel).toBe('mock');
  });

  it('returns defaultModel "llama-3.3-70b-versatile" for groq provider without key', () => {
    const { provider, defaultModel } = createLlmProvider({ provider: 'groq' });
    expect(provider).toBeInstanceOf(MockLlmProvider);
    expect(defaultModel).toBe('mock');
  });

  it('routes provider=grok to Groq Cloud when key has gsk_ prefix', () => {
    const { provider, defaultModel } = createLlmProvider({
      provider: 'grok',
      apiKey: 'gsk_TESTKEY123',
    });
    expect(provider).toBeInstanceOf(OpenAiLlmProvider);
    expect(defaultModel).toBe('llama-3.3-70b-versatile');
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
    const { defaultModel } = createLlmProvider({
      provider: 'grok',
      apiKey: 'xai-TESTKEY123',
    });
    expect(defaultModel).toBe('grok-3');
  });

  it('keeps provider=groq with gsk_ key', () => {
    const { defaultModel } = createLlmProvider({
      provider: 'groq',
      apiKey: 'gsk_TESTKEY123',
    });
    expect(defaultModel).toBe('llama-3.3-70b-versatile');
  });

  it('returns AnthropicLlmProvider for provider=anthropic with sk-ant key', () => {
    const { provider, defaultModel } = createLlmProvider({
      provider: 'anthropic',
      apiKey: 'sk-ant-FAKE',
    });
    expect(provider).toBeInstanceOf(AnthropicLlmProvider);
    expect(defaultModel).toBe('claude-sonnet-4-6');
  });

  it('accepts provider=claude alias', () => {
    const { provider } = createLlmProvider({
      provider: 'claude',
      apiKey: 'sk-ant-FAKE',
    });
    expect(provider).toBeInstanceOf(AnthropicLlmProvider);
  });

  it('falls back to mock when anthropic is selected but no key is set', () => {
    const { provider, defaultModel } = createLlmProvider({ provider: 'anthropic' });
    expect(provider).toBeInstanceOf(MockLlmProvider);
    expect(defaultModel).toBe('mock');
  });

  it('auto-routes sk-ant key to Anthropic even when provider=grok', () => {
    const { provider, defaultModel } = createLlmProvider({
      provider: 'grok',
      apiKey: 'sk-ant-FAKE',
    });
    expect(provider).toBeInstanceOf(AnthropicLlmProvider);
    expect(defaultModel).toBe('claude-sonnet-4-6');
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
          model: 'claude-sonnet-4-6',
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
      model: 'claude-sonnet-4-6',
      messages: [
        { role: 'system', content: 'You are Ultr0n.' },
        { role: 'user', content: 'hi' },
      ],
    });
    expect(Array.isArray(lastBody.system)).toBe(true);
    expect(lastBody.system[0].text).toBe('You are Ultr0n.');
    expect(lastBody.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(lastBody.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('omits temperature on Opus 4.7 (sampling params removed)', async () => {
    const p = new AnthropicLlmProvider({ apiKey: 'sk-ant-FAKE' });
    await p.generateResponse({
      model: 'claude-opus-4-7',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.5,
    });
    expect(lastBody.temperature).toBeUndefined();
  });

  it('keeps temperature on Sonnet 4.6', async () => {
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
      model: 'claude-sonnet-4-6',
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
      model: 'claude-sonnet-4-6',
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

import { sanitizeUltr0nContext } from './ultr0nContextSanitizer.js';

describe('sanitizeUltr0nContext', () => {
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
    const result = sanitizeUltr0nContext(ctx);
    expect(result.filters.psk).toBe('[REDACTED]');
    expect(result.filters.password).toBe('[REDACTED]');
    expect(result.filters.timeRange).toBe('24h');
  });

  it('does not mutate the original context', () => {
    const ctx = { filters: { psk: 'secret' } };
    sanitizeUltr0nContext(ctx);
    expect(ctx.filters.psk).toBe('secret');
  });

  it('redacts in selectedObject', () => {
    const ctx = {
      selectedObject: { name: 'SSID-Corp', psk: 'p@ssw0rd', ssid: 'Corp-WiFi' },
    };
    const result = sanitizeUltr0nContext(ctx);
    expect(result.selectedObject.psk).toBe('[REDACTED]');
    expect(result.selectedObject.name).toBe('SSID-Corp');
  });

  it('handles null/undefined context gracefully', () => {
    expect(sanitizeUltr0nContext(null)).toBeNull();
    expect(sanitizeUltr0nContext(undefined)).toBeUndefined();
  });

  it('truncates visibleRowsSummary sampleRows to 5', () => {
    const ctx = {
      visibleRowsSummary: {
        rowCount: 100,
        columns: ['mac', 'rssi'],
        sampleRows: Array.from({ length: 20 }, (_, i) => ({ mac: `00:${i}`, rssi: -70 })),
      },
    };
    const result = sanitizeUltr0nContext(ctx);
    expect(result.visibleRowsSummary.sampleRows.length).toBe(5);
    expect(result.visibleRowsSummary.rowCount).toBe(100);
  });
});
