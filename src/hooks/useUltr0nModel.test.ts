import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useUltr0nModel } from './useUltr0nModel';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

const SAMPLE_RESPONSE = {
  providers: ['groq'],
  defaultModel: 'llama-3.3-70b-versatile',
  models: [
    {
      id: 'llama-3.3-70b-versatile',
      label: 'Llama 3.3 70B',
      contextWindow: 128000,
      notes: 'Default',
      provider: 'groq',
    },
    {
      id: 'llama-3.1-8b-instant',
      label: 'Llama 3.1 8B',
      contextWindow: 128000,
      notes: 'Fast',
      provider: 'groq',
    },
  ],
};

describe('useUltr0nModel', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    localStorage.removeItem('ultr0n_model');
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => SAMPLE_RESPONSE,
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.removeItem('ultr0n_model');
  });

  it('loads models from /api/ultr0n/models and seeds the default selection', async () => {
    const { result } = renderHook(() => useUltr0nModel());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.providers).toEqual(['groq']);
    expect(result.current.models.length).toBe(2);
    expect(result.current.selectedModel).toBe('llama-3.3-70b-versatile');
    expect(localStorage.getItem('ultr0n_model')).toBe('llama-3.3-70b-versatile');
  });

  it('accepts the legacy single-provider response shape', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ...SAMPLE_RESPONSE, providers: undefined, provider: 'groq' }),
    })) as unknown as typeof fetch;

    const { result } = renderHook(() => useUltr0nModel());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.providers).toEqual(['groq']);
  });

  it('persists a user selection to localStorage', async () => {
    const { result } = renderHook(() => useUltr0nModel());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setSelectedModel('llama-3.1-8b-instant'));

    expect(result.current.selectedModel).toBe('llama-3.1-8b-instant');
    expect(localStorage.getItem('ultr0n_model')).toBe('llama-3.1-8b-instant');
  });

  it('honors a previously stored selection if it exists in the allowlist', async () => {
    localStorage.setItem('ultr0n_model', 'llama-3.1-8b-instant');
    const { result } = renderHook(() => useUltr0nModel());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.selectedModel).toBe('llama-3.1-8b-instant');
  });

  it('falls back to the server default when stored value is not in the allowlist', async () => {
    localStorage.setItem('ultr0n_model', 'mystery-model');
    const { result } = renderHook(() => useUltr0nModel());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.selectedModel).toBe('llama-3.3-70b-versatile');
    expect(localStorage.getItem('ultr0n_model')).toBe('llama-3.3-70b-versatile');
  });

  it('captures error and stops loading when fetch fails', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    const { result } = renderHook(() => useUltr0nModel());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
  });
});
