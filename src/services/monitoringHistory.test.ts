import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { monitoringHistory, rangeFromPreset, lastNDays } from './monitoringHistory';
import { MonitoringRequestError } from '../types/monitoring';

vi.mock('./api', () => ({
  apiService: { getAccessToken: () => 'test-token-value' },
  getDynamicControllerUrl: () => 'https://ctrl.example.com',
}));

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe('monitoringHistory.getHistory', () => {
  it('calls the backend history endpoint', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ series: [], meta: {} }));
    await monitoringHistory.getHistory();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/monitoring/history');
  });

  it('sends the controller token and controller URL header', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ series: [], meta: {} }));
    await monitoringHistory.getHistory();

    const { headers } = fetchMock.mock.calls[0][1];
    expect(headers.Authorization).toBe('Bearer test-token-value');
    expect(headers['X-Controller-URL']).toBe('https://ctrl.example.com');
  });

  it('serializes filters into the query string', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ series: [], meta: {} }));
    await monitoringHistory.getHistory({
      start: '2026-08-01T00:00:00.000Z',
      end: '2026-08-05T00:00:00.000Z',
      siteId: 'site-1',
      metricFamily: 'sle',
      metricNames: ['coverage', 'roaming'],
      resolutionMinutes: 15,
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('start=2026-08-01T00%3A00%3A00.000Z');
    expect(url).toContain('siteId=site-1');
    expect(url).toContain('metricName=coverage%2Croaming');
    expect(url).toContain('resolution=15');
  });

  it('omits empty filters instead of sending blanks', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ series: [], meta: {} }));
    await monitoringHistory.getHistory({ siteId: undefined, deviceId: '' });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/monitoring/history');
  });

  it('throws a typed error for a rejected range', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: 'range_too_large', detail: 'too much', retentionDays: 7 }, 400)
    );

    await expect(monitoringHistory.getHistory()).rejects.toBeInstanceOf(MonitoringRequestError);
    await expect(monitoringHistory.getHistory()).rejects.toMatchObject({
      status: 400,
      body: { error: 'range_too_large' },
    });
  });

  it('marks range errors so callers can distinguish them from outages', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'range_outside_retention' }, 400));
    try {
      await monitoringHistory.getHistory();
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as MonitoringRequestError).isRangeError).toBe(true);
    }
  });

  it('does not treat a 503 as a range error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Monitoring store unavailable' }, 503));
    try {
      await monitoringHistory.getHistory();
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as MonitoringRequestError).isRangeError).toBe(false);
      expect((error as MonitoringRequestError).status).toBe(503);
    }
  });

  it('survives a non-JSON error body', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json');
      },
    });
    await expect(monitoringHistory.getHistory()).rejects.toMatchObject({ status: 502 });
  });
});

describe('monitoringHistory.getLatest / getSourceHealth', () => {
  it('calls the latest endpoint with filters', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ metrics: [], meta: {} }));
    await monitoringHistory.getLatest({ siteId: 'site-1', metricFamily: 'sle' });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/api/monitoring/latest');
    expect(url).toContain('siteId=site-1');
  });

  it('calls the source health endpoint', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ sources: [], meta: {} }));
    await monitoringHistory.getSourceHealth();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/monitoring/sources/health');
  });
});

describe('range helpers', () => {
  const NOW = new Date('2026-08-05T12:00:00.000Z');

  it('defaults to seven days', () => {
    const range = rangeFromPreset('7d', NOW);
    expect(range.start).toBe('2026-07-29T12:00:00.000Z');
    expect(range.end).toBe('2026-08-05T12:00:00.000Z');
  });

  it('falls back to seven days for an unknown preset', () => {
    expect(rangeFromPreset('nonsense', NOW)).toEqual(rangeFromPreset('7d', NOW));
  });

  it('supports shorter presets', () => {
    expect(rangeFromPreset('1h', NOW).start).toBe('2026-08-05T11:00:00.000Z');
    expect(rangeFromPreset('24h', NOW).start).toBe('2026-08-04T12:00:00.000Z');
  });

  it('emits UTC ISO-8601', () => {
    expect(lastNDays(7, NOW).start).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });
});
