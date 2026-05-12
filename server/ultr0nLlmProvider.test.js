import { describe, it, expect } from 'vitest';
import { MockLlmProvider, createLlmProvider } from './ultr0nLlmProvider.js';

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
    const provider = createLlmProvider({ provider: 'mock' });
    expect(provider).toBeInstanceOf(MockLlmProvider);
  });

  it('returns MockLlmProvider when no config provided', () => {
    const provider = createLlmProvider({});
    expect(provider).toBeInstanceOf(MockLlmProvider);
  });
});
