import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { xiqService, XIQ_REGIONS, XIQ_REGION_LABELS, XIQ_REGION_ORDER } from './xiqService';

function installLocalStorageStub() {
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
  return store;
}

beforeEach(() => {
  installLocalStorageStub();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-08T12:00:00Z'));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('XIQ region constants', () => {
  it('has four regions: global, eu, apac, ca', () => {
    expect(Object.keys(XIQ_REGIONS).sort()).toEqual(['apac', 'ca', 'eu', 'global']);
  });

  it('every region has a https:// URL', () => {
    for (const url of Object.values(XIQ_REGIONS)) {
      expect(url).toMatch(/^https:\/\//);
    }
  });

  it('every region has a human label', () => {
    for (const region of Object.keys(XIQ_REGIONS)) {
      expect(XIQ_REGION_LABELS[region as keyof typeof XIQ_REGION_LABELS]).toBeTruthy();
    }
  });

  it('XIQ_REGION_ORDER lists every region exactly once', () => {
    const sortedRegions = Object.keys(XIQ_REGIONS).sort();
    const sortedOrder = [...XIQ_REGION_ORDER].sort();
    expect(sortedOrder).toEqual(sortedRegions);
  });
});

describe('xiqService.login', () => {
  it('POSTs to /xiq/login with the username/password/region body and saves token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({ access_token: 'tk', expires_in: 3600 }),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    const token = await xiqService.login('user@example.com', 'pw', 'global', 'sg-1');
    expect(token.access_token).toBe('tk');
    expect(token.region).toBe('global');
    // expiry is now + 3600s - 60s buffer = now + 3540s
    expect(token.expiry).toBe(Date.now() + 3540 * 1000);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/xiq/login');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.username).toBe('user@example.com');
    expect(body.region).toBe('global');

    // Token persisted under the per-site-group key
    const stored = JSON.parse(localStorage.getItem('xiq_token_sg-1')!);
    expect(stored.access_token).toBe('tk');
  });

  it('trims whitespace from the email before sending', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: 't', expires_in: 3600 }),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    await xiqService.login('  spaced@example.com   ', 'pw', 'eu', 'sg-1');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.username).toBe('spaced@example.com');
  });

  it('uses default 3600s TTL when expires_in is not in the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: 't' }),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    const token = await xiqService.login('e', 'p', 'global', 'sg-x');
    expect(token.expiry).toBe(Date.now() + (3600 - 60) * 1000);
  });

  it('throws with the API error message when the response carries one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Bad credentials' }),
      } as unknown as Response)
    );
    await expect(xiqService.login('e', 'p', 'global', 'sg-1')).rejects.toThrow('Bad credentials');
  });

  it('falls through to "XIQ login failed (status)" when the body is unparseable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('not json')),
      } as unknown as Response)
    );
    await expect(xiqService.login('e', 'p', 'global', 'sg-1')).rejects.toThrow(
      /XIQ login failed.*500/
    );
  });
});

describe('xiqService.getToken / isAuthenticated / clearToken', () => {
  const seed = (sgId: string, expiry: number) => {
    localStorage.setItem(
      `xiq_token_${sgId}`,
      JSON.stringify({ access_token: 't', region: 'global', expiry })
    );
  };

  it('returns the token when not yet expired', () => {
    seed('sg-1', Date.now() + 60_000);
    const token = xiqService.getToken('sg-1');
    expect(token?.access_token).toBe('t');
  });

  it('returns null + removes the token when expired', () => {
    seed('sg-1', Date.now() - 1);
    expect(xiqService.getToken('sg-1')).toBeNull();
    expect(localStorage.getItem('xiq_token_sg-1')).toBeNull();
  });

  it('returns null when storage holds malformed JSON', () => {
    localStorage.setItem('xiq_token_sg-1', '{not json');
    expect(xiqService.getToken('sg-1')).toBeNull();
  });

  it('isAuthenticated reflects token presence + expiry', () => {
    expect(xiqService.isAuthenticated('sg-1')).toBe(false);
    seed('sg-1', Date.now() + 60_000);
    expect(xiqService.isAuthenticated('sg-1')).toBe(true);
  });

  it('clearToken removes the token entry', () => {
    seed('sg-1', Date.now() + 60_000);
    xiqService.clearToken('sg-1');
    expect(localStorage.getItem('xiq_token_sg-1')).toBeNull();
  });
});

describe('xiqService.saveCredentials / getCredentials / clearCredentials', () => {
  it('round-trips credentials via base64-obfuscated localStorage', () => {
    xiqService.saveCredentials('sg-1', 'a@b.com', 'p', 'eu');
    const got = xiqService.getCredentials('sg-1');
    expect(got).toEqual({ email: 'a@b.com', password: 'p', region: 'eu' });
  });

  it('returns null when no credentials stored', () => {
    expect(xiqService.getCredentials('nothing')).toBeNull();
  });

  it('returns null when stored value is not valid base64 JSON', () => {
    localStorage.setItem('xiq_creds_sg-1', '!!!not-base64!!!');
    expect(xiqService.getCredentials('sg-1')).toBeNull();
  });

  it('clearCredentials removes both credentials and the active token', () => {
    xiqService.saveCredentials('sg-1', 'a', 'p', 'eu');
    localStorage.setItem(
      'xiq_token_sg-1',
      JSON.stringify({ access_token: 't', region: 'eu', expiry: Date.now() + 1_000 })
    );
    xiqService.clearCredentials('sg-1');
    expect(localStorage.getItem('xiq_creds_sg-1')).toBeNull();
    expect(localStorage.getItem('xiq_token_sg-1')).toBeNull();
  });
});

describe('xiqService.makeRequest', () => {
  it('throws when no token is stored for the site group', async () => {
    await expect(xiqService.makeRequest('sg-x', '/foo')).rejects.toThrow(/Not authenticated/);
  });

  it('targets the region base URL with Bearer auth header', async () => {
    localStorage.setItem(
      'xiq_token_sg-1',
      JSON.stringify({ access_token: 'TOKEN-XYZ', region: 'eu', expiry: Date.now() + 60_000 })
    );
    const fetchMock = vi.fn().mockResolvedValue({ ok: true } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    await xiqService.makeRequest('sg-1', '/sites');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${XIQ_REGIONS.eu}/sites`);
    expect(init.headers.Authorization).toBe('Bearer TOKEN-XYZ');
  });
});
