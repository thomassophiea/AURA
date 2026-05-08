import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const apiMock = vi.hoisted((): { apiService: any } => ({
  apiService: {
    makeAuthenticatedRequest: vi.fn(),
  },
}));

vi.mock('./api', () => apiMock);

beforeEach(() => {
  apiMock.apiService.makeAuthenticatedRequest.mockReset();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

import {
  fetchWidgetData,
  fetchSystemInformation,
  parseTimeseriesData,
  parseRankingData,
  parseScorecardData,
  parseDistributionData,
} from './widgetService';

describe('fetchWidgetData', () => {
  it('hits the deployment-wide endpoint when siteId is omitted', async () => {
    apiMock.apiService.makeAuthenticatedRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ snr: [] }),
    });
    await fetchWidgetData({ widgets: ['snr'] });
    const url = apiMock.apiService.makeAuthenticatedRequest.mock.calls[0][0];
    expect(url).toMatch(/^\/v1\/report\/sites\?/);
    expect(url).toMatch(/widgetList=snr%7Call/); // |all suffix added for snr
  });

  it('hits a site-specific endpoint when siteId is provided', async () => {
    apiMock.apiService.makeAuthenticatedRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({}),
    });
    await fetchWidgetData({ siteId: 's-1', widgets: ['something'] });
    const url = apiMock.apiService.makeAuthenticatedRequest.mock.calls[0][0];
    expect(url).toMatch(/^\/v1\/report\/sites\/s-1\?/);
  });

  it('appends "|all" to throughput / usage / user / snr / channelUtil widgets', async () => {
    apiMock.apiService.makeAuthenticatedRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({}),
    });
    await fetchWidgetData({
      widgets: ['ulDlThroughputTimeseries', 'channelUtilTrend', 'topUserCount', 'usageBreakdown'],
    });
    const url = apiMock.apiService.makeAuthenticatedRequest.mock.calls[0][0];
    // Each entry includes "|all" (URL-encoded as %7Call)
    const matches = url.match(/%7Call/g) ?? [];
    expect(matches.length).toBe(4);
  });

  it('does not append "|all" to widgets that do not need it', async () => {
    apiMock.apiService.makeAuthenticatedRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({}),
    });
    await fetchWidgetData({ widgets: ['bestPractices', 'apInventory'] });
    const url = apiMock.apiService.makeAuthenticatedRequest.mock.calls[0][0];
    expect(url).not.toMatch(/%7Call/);
  });

  it('returns the JSON body when the response is OK', async () => {
    apiMock.apiService.makeAuthenticatedRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ snr: { value: 42 } }),
    });
    const out = await fetchWidgetData({ widgets: ['snr'] });
    expect(out).toEqual({ snr: { value: 42 } });
  });

  it('throws when the response is not OK', async () => {
    apiMock.apiService.makeAuthenticatedRequest.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: async () => ({}),
      text: async () => '500',
    });
    await expect(fetchWidgetData({ widgets: ['snr'] })).rejects.toThrow(/Failed to fetch/i);
  });

  it('throws on a thrown fetch error', async () => {
    apiMock.apiService.makeAuthenticatedRequest.mockRejectedValueOnce(new Error('boom'));
    await expect(fetchWidgetData({ widgets: ['snr'] })).rejects.toThrow();
  });
});

describe('fetchSystemInformation', () => {
  it('returns the JSON body when OK', async () => {
    apiMock.apiService.makeAuthenticatedRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ version: '25.9.0' }),
    });
    const out = await fetchSystemInformation();
    expect(out.version).toBe('25.9.0');
  });

  it('throws when the response is not OK', async () => {
    apiMock.apiService.makeAuthenticatedRequest.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({}),
      text: async () => '404',
    });
    await expect(fetchSystemInformation()).rejects.toThrow(/Failed to fetch system/i);
  });
});

describe('parseTimeseriesData', () => {
  it('returns [] for empty / non-array input', () => {
    expect(parseTimeseriesData(null)).toEqual([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(parseTimeseriesData({} as any)).toEqual([]);
  });

  it('flattens reports with statistics and parses values to floats', () => {
    const out = parseTimeseriesData([
      {
        reportName: 'Throughput',
        reportType: 'TS',
        band: '5G',
        fromTimeInMillis: 1,
        toTimeInMillis: 10,
        statistics: [
          {
            statName: 'Mbps',
            type: 'gauge',
            unit: 'Mbps',
            values: [
              { timestamp: 1, value: '10.5' },
              { timestamp: 2, value: '20' },
            ],
          },
        ],
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].statistics[0].values).toEqual([
      { timestamp: 1, value: 10.5 },
      { timestamp: 2, value: 20 },
    ]);
  });

  it('coerces non-numeric values to 0', () => {
    const out = parseTimeseriesData([
      {
        statistics: [
          {
            values: [{ timestamp: 1, value: 'not-a-number' }],
          },
        ],
      },
    ]);
    expect(out[0].statistics[0].values[0].value).toBe(0);
  });
});

describe('parseRankingData', () => {
  it('returns [] for empty input', () => {
    expect(parseRankingData(null)).toEqual([]);
    expect(parseRankingData([])).toEqual([]);
  });

  it('returns [] when first report has no statistics', () => {
    expect(parseRankingData([{}])).toEqual([]);
  });

  it('parses statName + value/count + unit + additionalInfo', () => {
    const out = parseRankingData([
      {
        statistics: [
          { statName: 'AP-1', value: '10.5', unit: 'Mbps' },
          { label: 'AP-2', count: 5 },
        ],
      },
    ]);
    expect(out).toEqual([
      { name: 'AP-1', value: 10.5, unit: 'Mbps', additionalInfo: {} },
      { name: 'AP-2', value: 5, unit: '', additionalInfo: {} },
    ]);
  });
});

describe('parseScorecardData', () => {
  it('returns null for falsy/non-object input', () => {
    expect(parseScorecardData(null)).toBeNull();
    expect(parseScorecardData(undefined)).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(parseScorecardData('x' as any)).toBeNull();
  });

  it('returns the input object as-is when it is an object', () => {
    const data = { healthy: 5, total: 10 };
    expect(parseScorecardData(data)).toBe(data);
  });
});

describe('parseDistributionData', () => {
  it('returns [] for empty input', () => {
    expect(parseDistributionData(null)).toEqual([]);
    expect(parseDistributionData([])).toEqual([]);
    expect(parseDistributionData([{}])).toEqual([]);
  });

  it('builds {label, value, percentage} from statistics', () => {
    const out = parseDistributionData([
      {
        statistics: [
          { statName: 'Apple', value: '40', percentage: 0.4 },
          { label: 'Other', count: '60', percentage: 0.6 },
        ],
      },
    ]);
    expect(out).toEqual([
      { label: 'Apple', value: 40, percentage: 0.4 },
      { label: 'Other', value: 60, percentage: 0.6 },
    ]);
  });

  it('coerces missing value to 0 and missing label to "Unknown"', () => {
    const out = parseDistributionData([{ statistics: [{}] }]);
    expect(out[0].label).toBe('Unknown');
    expect(out[0].value).toBe(0);
  });

  it('does NOT coerce a non-numeric "value" string — parseFloat returns NaN', () => {
    // Documents the actual behavior: parseFloat("NaN") = NaN since "NaN" is truthy.
    const out = parseDistributionData([{ statistics: [{ value: 'NaN' }] }]);
    expect(Number.isNaN(out[0].value)).toBe(true);
  });
});
