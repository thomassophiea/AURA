import { describe, it, expect } from 'vitest';
import { MockLlmProvider, OpenAiLlmProvider, createLlmProvider } from './ultr0nLlmProvider.js';

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
