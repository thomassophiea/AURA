import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MODEL_REGISTRY,
  getAllowedModels,
  isModelAllowed,
  resolveActiveProvider,
} from './ultr0nModelRegistry.js';

describe('MODEL_REGISTRY', () => {
  it('exposes groq models including the documented defaults', () => {
    const ids = MODEL_REGISTRY.groq.map(m => m.id);
    expect(ids).toContain('llama-3.3-70b-versatile');
    expect(ids).toContain('llama-3.1-8b-instant');
    expect(ids).toContain('mixtral-8x7b-32768');
    expect(ids).toContain('openai/gpt-oss-120b');
  });

  it('exposes the current Anthropic models', () => {
    const ids = MODEL_REGISTRY.anthropic.map((m) => m.id);
    expect(ids).toContain('claude-opus-4-7');
    expect(ids).toContain('claude-sonnet-4-6');
    expect(ids).toContain('claude-haiku-4-5');
  });

  it('every model entry has the required shape', () => {
    for (const list of Object.values(MODEL_REGISTRY)) {
      for (const m of list) {
        expect(typeof m.id).toBe('string');
        expect(typeof m.label).toBe('string');
        expect(typeof m.contextWindow).toBe('number');
        expect(typeof m.notes).toBe('string');
      }
    }
  });
});

describe('getAllowedModels', () => {
  it('returns models for a known provider', () => {
    const models = getAllowedModels('groq');
    expect(models.length).toBeGreaterThan(0);
  });

  it('falls back to mock for an unknown provider', () => {
    expect(getAllowedModels('nonexistent')).toEqual(MODEL_REGISTRY.mock);
  });
});

describe('isModelAllowed', () => {
  it('returns true for a registered groq model', () => {
    expect(isModelAllowed('groq', 'llama-3.1-8b-instant')).toBe(true);
  });

  it('returns false for a model not in the registry', () => {
    expect(isModelAllowed('groq', 'definitely-not-a-real-model')).toBe(false);
  });

  it('returns false for empty or missing model ids', () => {
    expect(isModelAllowed('groq', '')).toBe(false);
    expect(isModelAllowed('groq', undefined)).toBe(false);
  });

  it('rejects a groq model name when provider is openai', () => {
    expect(isModelAllowed('openai', 'llama-3.3-70b-versatile')).toBe(false);
  });
});

describe('resolveActiveProvider', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.ULTR0N_LLM_PROVIDER;
    delete process.env.GROK_API_KEY;
    delete process.env.GROQ_API_KEY;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('returns mock when no provider env is set', () => {
    expect(resolveActiveProvider()).toBe('mock');
  });

  it('auto-corrects grok to groq when key has gsk_ prefix', () => {
    process.env.ULTR0N_LLM_PROVIDER = 'grok';
    process.env.GROK_API_KEY = 'gsk_FAKE';
    expect(resolveActiveProvider()).toBe('groq');
  });

  it('auto-corrects groq to grok when key has xai- prefix', () => {
    process.env.ULTR0N_LLM_PROVIDER = 'groq';
    process.env.GROK_API_KEY = 'xai-FAKE';
    expect(resolveActiveProvider()).toBe('grok');
  });

  it('leaves provider as-is when key prefix matches', () => {
    process.env.ULTR0N_LLM_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'gsk_FAKE';
    expect(resolveActiveProvider()).toBe('groq');
  });

  it('routes to anthropic when ANTHROPIC_API_KEY is set', () => {
    process.env.ULTR0N_LLM_PROVIDER = 'groq';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-FAKE';
    expect(resolveActiveProvider()).toBe('anthropic');
  });

  it('routes to anthropic when CLAUDE_API_KEY is set', () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-FAKE';
    expect(resolveActiveProvider()).toBe('anthropic');
  });

  it('routes to anthropic when GROK_API_KEY holds an sk-ant key', () => {
    process.env.ULTR0N_LLM_PROVIDER = 'grok';
    process.env.GROK_API_KEY = 'sk-ant-FAKE';
    expect(resolveActiveProvider()).toBe('anthropic');
  });

  it('accepts the claude alias on the provider env', () => {
    process.env.ULTR0N_LLM_PROVIDER = 'claude';
    expect(resolveActiveProvider()).toBe('anthropic');
  });
});
