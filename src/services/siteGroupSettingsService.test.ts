import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// vi.mock factories must hoist; build the mock with vi.hoisted so the
// reference survives the hoisting pass.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockSupabase = vi.hoisted((): { from: any; builder: any } => {
  // Build the chainable Supabase client mock. Each chain method (select, eq,
  // update) returns the same builder object so .from().select().eq().single()
  // resolves with whatever .single() is mocked to return for the current test.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.update = vi.fn(() => builder);
  builder.single = vi.fn();
  const from = vi.fn(() => builder);
  return { from, builder };
});

vi.mock('./supabaseClient', () => ({
  supabase: { from: mockSupabase.from },
}));

// Provide an env value so _isSupabaseConfigured returns true in tests.
vi.stubEnv('VITE_SUPABASE_URL', 'https://real.supabase.co');

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
  mockSupabase.from.mockClear();
  mockSupabase.builder.select.mockClear();
  mockSupabase.builder.eq.mockClear();
  // Reset update fully so per-test mockReturnValue overrides are isolated,
  // then restore the chainable behavior.
  mockSupabase.builder.update.mockReset();
  mockSupabase.builder.update.mockImplementation(() => mockSupabase.builder);
  mockSupabase.builder.single.mockReset();
  // Default .single() to a benign empty result so chains never await undefined.
  mockSupabase.builder.single.mockResolvedValue({ data: { settings: {} }, error: null });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

import { siteGroupSettingsService } from './siteGroupSettingsService';
import { DEFAULT_SITE_GROUP_SETTINGS } from '../types/siteGroupSettings';

describe('siteGroupSettingsService.getSettings', () => {
  it('returns merged defaults when Supabase row has no site_group_settings', async () => {
    mockSupabase.builder.single.mockResolvedValueOnce({ data: { settings: {} }, error: null });
    const out = await siteGroupSettingsService.getSettings('sg-1');
    expect(out.connection.timeout_ms).toBe(DEFAULT_SITE_GROUP_SETTINGS.connection.timeout_ms);
    expect(out.deployment.notify_on_failure).toBe(true);
    expect(out.custom).toEqual({});
  });

  it('returns the persisted settings when Supabase has them', async () => {
    mockSupabase.builder.single.mockResolvedValueOnce({
      data: {
        settings: {
          site_group_settings: {
            connection: { timeout_ms: 25000 },
            deployment: { auto_deploy: true },
            custom: { foo: 'bar' },
          },
        },
      },
      error: null,
    });
    const out = await siteGroupSettingsService.getSettings('sg-2');
    expect(out.connection.timeout_ms).toBe(25000);
    expect(out.connection.preferred_protocol).toBe('https'); // default still applied
    expect(out.deployment.auto_deploy).toBe(true);
    expect(out.custom).toEqual({ foo: 'bar' });
  });

  it('caches the resolved settings in localStorage', async () => {
    mockSupabase.builder.single.mockResolvedValueOnce({
      data: { settings: { site_group_settings: { connection: { retry_count: 7 } } } },
      error: null,
    });
    await siteGroupSettingsService.getSettings('sg-3');
    const cached = JSON.parse(localStorage.getItem('sg_settings:sg-3')!);
    expect(cached.connection.retry_count).toBe(7);
  });

  it('falls back to localStorage cache when Supabase errors', async () => {
    localStorage.setItem(
      'sg_settings:sg-4',
      JSON.stringify({
        ...DEFAULT_SITE_GROUP_SETTINGS,
        connection: { ...DEFAULT_SITE_GROUP_SETTINGS.connection, timeout_ms: 99999 },
      })
    );
    mockSupabase.builder.single.mockResolvedValueOnce({
      data: null,
      error: new Error('network down'),
    });
    const out = await siteGroupSettingsService.getSettings('sg-4');
    expect(out.connection.timeout_ms).toBe(99999);
    expect(console.warn).toHaveBeenCalled();
  });

  it('returns defaults when cache is empty and Supabase fails', async () => {
    mockSupabase.builder.single.mockResolvedValueOnce({
      data: null,
      error: new Error('boom'),
    });
    const out = await siteGroupSettingsService.getSettings('sg-5');
    expect(out).toEqual(DEFAULT_SITE_GROUP_SETTINGS);
  });
});

describe('siteGroupSettingsService.updateSettings', () => {
  it('merges updates over current settings and writes to Supabase', async () => {
    // First .single() call (from getSettings inside updateSettings)
    mockSupabase.builder.single.mockResolvedValueOnce({
      data: { settings: { site_group_settings: { connection: { timeout_ms: 10000 } } } },
      error: null,
    });
    // Second .single() call (the explicit pre-update fetch)
    mockSupabase.builder.single.mockResolvedValueOnce({
      data: { settings: { site_group_settings: { connection: { timeout_ms: 10000 } } } },
      error: null,
    });
    // The .update() chain: from -> update -> eq returns { error: null }
    mockSupabase.builder.update.mockReturnValue({
      eq: vi.fn().mockResolvedValueOnce({ error: null }),
    });

    const out = await siteGroupSettingsService.updateSettings('sg-6', {
      connection: { ...DEFAULT_SITE_GROUP_SETTINGS.connection, timeout_ms: 60000 },
      deployment: { ...DEFAULT_SITE_GROUP_SETTINGS.deployment, auto_deploy: true },
    });

    expect(out.connection.timeout_ms).toBe(60000);
    expect(out.deployment.auto_deploy).toBe(true);
    expect(mockSupabase.builder.update).toHaveBeenCalled();
  });

  it('caches the merged result in localStorage after a successful write', async () => {
    mockSupabase.builder.single.mockResolvedValueOnce({ data: { settings: {} }, error: null });
    mockSupabase.builder.single.mockResolvedValueOnce({ data: { settings: {} }, error: null });
    mockSupabase.builder.update.mockReturnValue({
      eq: vi.fn().mockResolvedValueOnce({ error: null }),
    });

    await siteGroupSettingsService.updateSettings('sg-7', {
      custom: { theme: 'dark' },
    });
    const cached = JSON.parse(localStorage.getItem('sg_settings:sg-7')!);
    expect(cached.custom).toEqual({ theme: 'dark' });
  });

  it('throws when the Supabase update fails', async () => {
    mockSupabase.builder.single.mockResolvedValueOnce({ data: { settings: {} }, error: null });
    mockSupabase.builder.single.mockResolvedValueOnce({ data: { settings: {} }, error: null });
    mockSupabase.builder.update.mockReturnValue({
      eq: vi.fn().mockResolvedValueOnce({ error: { message: 'permission denied' } }),
    });
    await expect(
      siteGroupSettingsService.updateSettings('sg-8', { custom: { foo: 1 } })
    ).rejects.toThrow('permission denied');
  });
});
