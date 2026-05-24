import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createCortexSession,
  sendCortexMessage,
  refreshCortexContext,
  executeCortexToolCall,
  queryCortexWireless,
} from './cortexApiClient';

vi.mock('./api', () => ({
  apiService: { getAccessToken: () => 'test-token' },
  getDynamicControllerUrl: () => 'https://ctrl.example.com',
}));

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('createCortexSession', () => {
  it('POSTs to /api/cortex/session and returns sessionId', async () => {
    vi.stubGlobal('fetch', mockFetch({ sessionId: 'sess-123' }));
    const result = await createCortexSession({ navigationScope: 'global' } as never);
    expect(result.sessionId).toBe('sess-123');
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/cortex/session');
  });

  it('includes Authorization and X-Controller-URL headers', async () => {
    vi.stubGlobal('fetch', mockFetch({ sessionId: 'x' }));
    await createCortexSession({} as never);
    const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-token');
    expect(headers['X-Controller-URL']).toBe('https://ctrl.example.com');
  });
});

describe('sendCortexMessage', () => {
  it('returns an AgentMessage with timestamp as Date', async () => {
    const ts = '2026-05-22T10:00:00Z';
    vi.stubGlobal(
      'fetch',
      mockFetch({ id: 'msg-1', role: 'assistant', content: 'Hello', timestamp: ts })
    );
    const msg = await sendCortexMessage('sess-1', 'Hi', {} as never);
    expect(msg.role).toBe('agent');
    expect(msg.timestamp).toBeInstanceOf(Date);
    expect(msg.content).toBe('Hello');
  });
});

describe('refreshCortexContext', () => {
  it('resolves without value', async () => {
    vi.stubGlobal('fetch', mockFetch({}));
    await expect(refreshCortexContext('sess-1', {} as never)).resolves.toBeUndefined();
  });
});

describe('executeCortexToolCall', () => {
  it('POSTs to /api/cortex/tool-call and returns result', async () => {
    vi.stubGlobal('fetch', mockFetch({ result: 'done' }));
    const result = await executeCortexToolCall('sess-1', 'listSites', { siteId: 's1' });
    expect(result).toEqual({ result: 'done' });
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.toolName).toBe('listSites');
  });
});

describe('queryCortexWireless', () => {
  it('returns null for 422 responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        statusText: 'Unprocessable',
        text: () => Promise.resolve('Cortex API error 422: not wireless'),
      })
    );
    const result = await queryCortexWireless('what is the weather?', {} as never);
    expect(result).toBeNull();
  });

  it('throws for non-422 server errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('crash'),
      })
    );
    await expect(queryCortexWireless('how many clients?', {} as never)).rejects.toThrow(
      'Cortex API error 500'
    );
  });

  it('returns the wireless answer on success', async () => {
    const answer = { question: 'how many clients?', answer: '42', evidence: [] };
    vi.stubGlobal('fetch', mockFetch(answer));
    const result = await queryCortexWireless('how many clients?', {} as never);
    expect(result).toEqual(answer);
  });
});
