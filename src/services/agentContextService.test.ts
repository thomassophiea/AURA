import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../hooks/useGlobalFilters', () => ({
  getGlobalFilters: () => ({ timeRange: '24h', site: 'all', environment: 'all' }),
}));

vi.mock('./api', () => ({
  apiService: { getAccessToken: () => 'tok-abc' },
}));

import { writeAgentContext } from './agentContextService';

function makeFetch(responses: Array<{ ok: boolean; body: unknown }>) {
  let call = 0;
  return vi.fn().mockImplementation(() => {
    const r = responses[call++] ?? { ok: false, body: '' };
    return Promise.resolve({
      ok: r.ok,
      json: () => Promise.resolve(r.body),
    });
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('writeAgentContext', () => {
  it('writes markdown to localStorage', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch([
        { ok: true, body: [] }, // stations
        { ok: true, body: [] }, // aps
        { ok: true, body: {} }, // shell/context POST
      ])
    );
    await writeAgentContext({ navigationScope: 'global' });
    const stored = localStorage.getItem('aura_agent_context');
    expect(stored).toContain('AURA Live Session Context');
    expect(stored).toContain('global');
  });

  it('includes client count when station fetch succeeds', async () => {
    const stations = [{ mac: 'aa:bb' }, { mac: 'cc:dd' }];
    vi.stubGlobal(
      'fetch',
      makeFetch([
        { ok: true, body: stations },
        { ok: true, body: [] },
        { ok: true, body: {} },
      ])
    );
    await writeAgentContext({ navigationScope: 'global' });
    const stored = localStorage.getItem('aura_agent_context') ?? '';
    expect(stored).toContain('2');
  });

  it('includes AP summary when ap fetch succeeds', async () => {
    const aps = [
      { status: 'connected', clientCount: 5 },
      { status: 'connected', clientCount: 3 },
      { status: 'disconnected', clientCount: 0 },
    ];
    vi.stubGlobal(
      'fetch',
      makeFetch([
        { ok: false, body: null }, // stations fail
        { ok: true, body: aps },
        { ok: true, body: {} },
      ])
    );
    await writeAgentContext({ navigationScope: 'site-group', siteGroupName: 'HQ' });
    const stored = localStorage.getItem('aura_agent_context') ?? '';
    expect(stored).toContain('2 up / 3 total');
    expect(stored).toContain('HQ');
  });

  it('still writes context when API calls fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    await writeAgentContext({ navigationScope: 'global' });
    const stored = localStorage.getItem('aura_agent_context');
    expect(stored).toContain('AURA Live Session Context');
  });

  it('POSTs markdown to /api/cortex/shell/context', async () => {
    const fetchMock = makeFetch([
      { ok: false, body: null },
      { ok: false, body: null },
      { ok: true, body: {} },
    ]);
    vi.stubGlobal('fetch', fetchMock);
    await writeAgentContext({ navigationScope: 'global', controllerUrl: 'https://ctrl' });
    const contextPost = fetchMock.mock.calls.find((c) => {
      const url = String(c[0]);
      return url.includes('/api/cortex/shell/context');
    });
    expect(contextPost).toBeDefined();
    const body = JSON.parse(contextPost![1].body);
    expect(body.markdown).toContain('AURA Live Session Context');
  });
});
