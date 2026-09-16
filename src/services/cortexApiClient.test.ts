import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createCortexSession,
  sendCortexMessage,
  refreshCortexContext,
  parseWirelessInstruction,
  validateWirelessIntent,
  provisionWirelessIntent,
  queryCortexWireless,
  describeInfrastructureFailure,
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

describe('error message extraction', () => {
  it('surfaces the plain-text {error} field from a JSON error body, not the raw JSON blob', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: () => Promise.resolve(JSON.stringify({ error: 'AURA Cortex is disabled.' })),
      })
    );
    await expect(parseWirelessInstruction('create a guest wlan')).rejects.toThrow(
      'Cortex API error 403: AURA Cortex is disabled.'
    );
  });
});

describe('parseWirelessInstruction', () => {
  it('POSTs to /api/cortex/wireless/intent with the input and source', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({ intent: { action: 'create_wlan' }, missingFields: [], ambiguities: [], riskLevel: 'high', humanReadable: '', classification: 'mutating' })
    );
    const result = await parseWirelessInstruction('create a guest wlan', 'text');
    expect(result.classification).toBe('mutating');
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/api/cortex/wireless/intent');
    expect(JSON.parse(init?.body as string)).toEqual({ input: 'create a guest wlan', source: 'text' });
  });
});

describe('validateWirelessIntent', () => {
  it('POSTs to /api/cortex/wireless/validate and returns the report', async () => {
    const report = { intent: {}, checks: [], confidence: { score: 90, band: 'HIGH', blockingIssues: [], warnings: [] }, recommendation: 'ok', planHash: 'abc', validationToken: 'tok', expiresAt: '2026-01-01T00:00:00Z' };
    vi.stubGlobal('fetch', mockFetch(report));
    const result = await validateWirelessIntent({ action: 'create_wlan', requestedBy: 'u', source: 'text', rawInstruction: 'x' });
    expect(result.planHash).toBe('abc');
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/cortex/wireless/validate');
  });
});

describe('provisionWirelessIntent', () => {
  it('POSTs to /api/cortex/wireless/provision with the full approval payload', async () => {
    vi.stubGlobal('fetch', mockFetch({ status: 'completed', serviceId: 'svc-1' }));
    const result = await provisionWirelessIntent({
      intent: { action: 'create_wlan', requestedBy: 'u', source: 'text', rawInstruction: 'x' },
      planHash: 'abc',
      validationToken: 'tok',
      profileIds: ['p1'],
      approvedBy: 'operator1',
    });
    expect(result.status).toBe('completed');
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.approvedBy).toBe('operator1');
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

describe('describeInfrastructureFailure', () => {
  it('replaces the edge proxy’s two words with what actually happened', () => {
    // The reported defect: "How is Primary site overall?" answered `upstream
    // error`, which is Envoy talking to whoever runs Envoy, rendered as though
    // it were Cortex's verdict on the site.
    const msg = describeInfrastructureFailure(502, 'upstream error');

    expect(msg).toMatch(/did not answer in time/i);
    expect(msg).toMatch(/Nothing was changed on the Gateway/i);
    // The raw body is kept as evidence, not hidden.
    expect(msg).toContain('upstream error');
    expect(msg.startsWith('upstream error')).toBe(false);
  });

  it('covers every gateway-timeout status the edge can answer with', () => {
    for (const status of [502, 503, 504]) {
      expect(describeInfrastructureFailure(status, '')).toMatch(/did not answer in time/i);
    }
  });

  it('flattens an HTML error page instead of pasting it into the transcript', () => {
    const html = '<html><head><title>504 Gateway Time-out</title></head><body><h1>504</h1></body></html>';
    const msg = describeInfrastructureFailure(504, html);

    expect(msg).not.toContain('<');
    expect(msg).toContain('504 Gateway Time-out');
    expect(msg.length).toBeLessThan(300);
  });

  it('names the rate limit and the size limit rather than a bare number', () => {
    expect(describeInfrastructureFailure(429, '')).toMatch(/too many questions/i);
    expect(describeInfrastructureFailure(413, '')).toMatch(/too large/i);
  });

  it('falls back to the status code when nothing else is known', () => {
    expect(describeInfrastructureFailure(418, '')).toBe('Cortex could not be reached (HTTP 418).');
  });

  it('adds no empty parenthetical when the body is blank', () => {
    expect(describeInfrastructureFailure(502, '   ')).not.toContain('()');
  });
});
