import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the supabase info module so module load doesn't crash on missing env.
vi.mock('../utils/supabase/info', () => ({
  projectId: 'test-project',
  publicAnonKey: 'test-anon-key',
}));

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  });
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  // Reset window.chatbase between tests.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).chatbase;
  // Provide a minimal crypto.subtle.digest fallback for the SHA-256 hash helper.
  if (!crypto.subtle?.digest) {
    Object.defineProperty(crypto, 'subtle', {
      configurable: true,
      value: {
        digest: vi.fn(async () => new Uint8Array(32).buffer),
      },
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

import { getChatbaseToken, identifyUserWithChatbase } from './chatbaseIdentity';

describe('getChatbaseToken', () => {
  it('returns null when no user_email is in localStorage', async () => {
    const out = await getChatbaseToken();
    expect(out).toBeNull();
  });

  it('hits the supabase function and returns the token field on OK', async () => {
    localStorage.setItem('user_email', 'me@example.com');
    localStorage.setItem('admin_role', 'super-admin');

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ token: 'jwt-12345' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const out = await getChatbaseToken();
    expect(out).toBe('jwt-12345');
    const url = (fetchMock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0];
    expect(url).toContain('test-project');
    expect(url).toContain('/chatbase/token');
  });

  it('returns null on a non-OK response', async () => {
    localStorage.setItem('user_email', 'me@example.com');
    vi.stubGlobal('fetch', async () => ({
      ok: false,
      json: async () => ({ error: 'forbidden' }),
    }));

    expect(await getChatbaseToken()).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  it('returns null when fetch throws', async () => {
    localStorage.setItem('user_email', 'me@example.com');
    vi.stubGlobal('fetch', async () => {
      throw new Error('network');
    });
    expect(await getChatbaseToken()).toBeNull();
  });
});

describe('identifyUserWithChatbase', () => {
  it('returns false when no token is available (no user_email)', async () => {
    expect(await identifyUserWithChatbase()).toBe(false);
  });

  it('returns false when window.chatbase is not loaded', async () => {
    localStorage.setItem('user_email', 'me@example.com');
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({ token: 'jwt-9' }),
    }));
    expect(await identifyUserWithChatbase()).toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });

  it('calls window.chatbase("identify", { token }) and returns true when loaded', async () => {
    localStorage.setItem('user_email', 'me@example.com');
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({ token: 'jwt-9' }),
    }));
    const chatbaseFn = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).chatbase = chatbaseFn;
    expect(await identifyUserWithChatbase()).toBe(true);
    expect(chatbaseFn).toHaveBeenCalledWith('identify', { token: 'jwt-9' });
  });
});
