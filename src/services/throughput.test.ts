import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { throughputService } from './throughput';

const okJson = (body: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(body),
  } as unknown as Response);

const errResponse = (status: number, body: unknown = { error: `HTTP ${status}` }) =>
  Promise.resolve({
    ok: false,
    status,
    statusText: 'Error',
    json: () => Promise.resolve(body),
  } as unknown as Response);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-08T12:00:00Z'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('throughputService.storeSnapshot', () => {
  it('POSTs to /api/throughput/snapshot with the JSON-serialized snapshot', async () => {
    const fetchMock = vi.fn().mockReturnValue(okJson({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const snap = {
      timestamp: 1,
      upload_bps: 100,
      download_bps: 200,
      total_bps: 300,
      client_count: 5,
    };
    await throughputService.storeSnapshot(
      snap as unknown as Parameters<typeof throughputService.storeSnapshot>[0]
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/throughput/snapshot');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toMatchObject({ total_bps: 300, client_count: 5 });
  });

  it('throws when the API responds with an error body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(errResponse(500, { error: 'snapshot rejected' }))
    );
    await expect(
      throughputService.storeSnapshot({
        timestamp: 0,
        upload_bps: 0,
        download_bps: 0,
        total_bps: 0,
        client_count: 0,
      } as unknown as Parameters<typeof throughputService.storeSnapshot>[0])
    ).rejects.toThrow('snapshot rejected');
  });

  it('falls back to "HTTP {status}" when the error body is unparseable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        Promise.resolve({
          ok: false,
          status: 502,
          statusText: 'Bad Gateway',
          json: () => Promise.reject(new Error('not json')),
        } as unknown as Response)
      )
    );
    await expect(
      throughputService.storeSnapshot({
        timestamp: 0,
        upload_bps: 0,
        download_bps: 0,
        total_bps: 0,
        client_count: 0,
      } as unknown as Parameters<typeof throughputService.storeSnapshot>[0])
    ).rejects.toThrow(/Unknown error|HTTP 502/);
  });
});

describe('throughputService.getSnapshots', () => {
  it('calls /api/throughput/snapshots with no query when no args', async () => {
    const fetchMock = vi.fn().mockReturnValue(okJson({ snapshots: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await throughputService.getSnapshots();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/throughput/snapshots');
  });

  it('appends startTime / endTime / limit to the query when provided', async () => {
    const fetchMock = vi.fn().mockReturnValue(okJson({ snapshots: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await throughputService.getSnapshots(1000, 2000, 50);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('startTime=1000');
    expect(url).toContain('endTime=2000');
    expect(url).toContain('limit=50');
  });

  it('returns an empty array when the response has no snapshots key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(okJson({})));
    const result = await throughputService.getSnapshots();
    expect(result).toEqual([]);
  });

  it('returns the snapshots array from the response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(okJson({ snapshots: [{ total_bps: 1 }, { total_bps: 2 }] }))
    );
    const result = await throughputService.getSnapshots();
    expect(result).toHaveLength(2);
  });
});

describe('throughputService.getLatestSnapshot', () => {
  it('returns the snapshot from the response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(okJson({ snapshot: { total_bps: 999 } })));
    const result = await throughputService.getLatestSnapshot();
    expect(result).toEqual({ total_bps: 999 });
  });

  it('returns null when no snapshot in response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(okJson({})));
    const result = await throughputService.getLatestSnapshot();
    expect(result).toBeNull();
  });
});

describe('throughputService.getNetworkTrends', () => {
  it('encodes the network name in the path', async () => {
    const fetchMock = vi.fn().mockReturnValue(okJson({ trends: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await throughputService.getNetworkTrends('Voice WLAN');
    expect(fetchMock.mock.calls[0][0]).toContain('Voice%20WLAN');
  });

  it('appends start/end query params when provided', async () => {
    const fetchMock = vi.fn().mockReturnValue(okJson({ trends: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await throughputService.getNetworkTrends('net', 100, 200);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('startTime=100');
    expect(url).toContain('endTime=200');
  });

  it('returns an empty array when no trends key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(okJson({})));
    const result = await throughputService.getNetworkTrends('x');
    expect(result).toEqual([]);
  });
});

describe('throughputService.clearAllData', () => {
  it('issues a DELETE and returns deletedCount', async () => {
    const fetchMock = vi.fn().mockReturnValue(okJson({ deletedCount: 17 }));
    vi.stubGlobal('fetch', fetchMock);
    const n = await throughputService.clearAllData();
    expect(n).toBe(17);
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
  });

  it('defaults to 0 when no deletedCount in response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(okJson({})));
    expect(await throughputService.clearAllData()).toBe(0);
  });
});

describe('throughputService.getSnapshotsForLastHours / Minutes', () => {
  it('Hours: computes startTime as N hours back and end as Date.now()', async () => {
    const fetchMock = vi.fn().mockReturnValue(okJson({ snapshots: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await throughputService.getSnapshotsForLastHours(2);
    const url = fetchMock.mock.calls[0][0] as string;
    const now = Date.now();
    expect(url).toContain(`endTime=${now}`);
    expect(url).toContain(`startTime=${now - 2 * 60 * 60 * 1000}`);
  });

  it('Minutes: computes startTime as N minutes back', async () => {
    const fetchMock = vi.fn().mockReturnValue(okJson({ snapshots: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await throughputService.getSnapshotsForLastMinutes(15);
    const url = fetchMock.mock.calls[0][0] as string;
    const now = Date.now();
    expect(url).toContain(`startTime=${now - 15 * 60 * 1000}`);
  });
});

describe('throughputService.getTodayStats', () => {
  it('computes startTime as midnight of the local day', async () => {
    const fetchMock = vi.fn().mockReturnValue(okJson({}));
    vi.stubGlobal('fetch', fetchMock);
    await throughputService.getTodayStats();
    const url = fetchMock.mock.calls[0][0] as string;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    expect(url).toContain(`startTime=${startOfDay}`);
  });
});
