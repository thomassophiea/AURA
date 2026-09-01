/**
 * The controller's report `duration` is an enum — exactly 3H, 3D and 14D
 * answer; every other token 500s after ~31s (probed live 2026-09-01). These
 * tests pin the fetch layer's contract: requested windows map onto that enum,
 * and responses are trimmed back to the window actually asked for, so charts
 * never show more than their label claims.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiService } from './api';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function fixture(now: number) {
  return {
    throughputReport: [
      {
        statistics: [
          {
            statName: 'Total',
            values: [
              { timestamp: now - 2 * DAY, value: '10' },
              { timestamp: now - HOUR, value: '20' },
            ],
          },
        ],
      },
    ],
    // Aggregate widget: no timestamps, must pass through untouched.
    topAppGroupsByThroughputReport: [
      { statistics: [{ name: 'Streaming', value: 5 }] },
    ],
  };
}

function mockResponse(now: number) {
  return {
    ok: true,
    json: async () => JSON.parse(JSON.stringify(fixture(now))),
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('report duration mapping', () => {
  it('asks for 3D when the window is 24H, and trims back to 24 hours', async () => {
    const now = Date.now();
    const spy = vi
      .spyOn(apiService, 'makeAuthenticatedRequest')
      .mockResolvedValue(mockResponse(now));

    const data = await apiService.getClientInsights('AA:BB:CC:DD:EE:FF', '24H', 15, 'default');

    const endpoint = spy.mock.calls[0][0] as string;
    expect(endpoint).toContain('duration=3D');
    expect(endpoint).not.toContain('duration=24H');

    const values = data.throughputReport![0].statistics[0].values!;
    expect(values).toHaveLength(1);
    expect(values[0].value).toBe('20');
    // Aggregates carry no timestamps and are kept as-is.
    expect(data.topAppGroupsByThroughputReport![0].statistics).toHaveLength(1);
  });

  it('passes a servable token through untrimmed', async () => {
    const now = Date.now();
    const spy = vi
      .spyOn(apiService, 'makeAuthenticatedRequest')
      .mockResolvedValue(mockResponse(now));

    const data = await apiService.getClientInsights('AA:BB:CC:DD:EE:FF', '3H', 15, 'default');

    expect(spy.mock.calls[0][0]).toContain('duration=3H');
    // No trim requested — the 2-day-old point survives.
    expect(data.throughputReport![0].statistics[0].values).toHaveLength(2);
  });

  it('maps sub-3H windows up to 3H and trims to the hour asked for', async () => {
    const now = Date.now();
    const spy = vi
      .spyOn(apiService, 'makeAuthenticatedRequest')
      .mockResolvedValue(mockResponse(now));

    const data = await apiService.getAccessPointInsights('SERIAL-1', '1H', 15);

    expect(spy.mock.calls[0][0]).toContain('duration=3H');
    const values = data.throughputReport![0].statistics[0].values!;
    // now-1h is exactly on the cutoff boundary; only it survives.
    expect(values.every((v: { timestamp: number }) => v.timestamp >= now - HOUR)).toBe(true);
  });

  it('maps 7D onto 14D', async () => {
    const spy = vi
      .spyOn(apiService, 'makeAuthenticatedRequest')
      .mockResolvedValue(mockResponse(Date.now()));

    await apiService.getClientInsights('AA:BB:CC:DD:EE:FF', '7D', 15, 'default');

    expect(spy.mock.calls[0][0]).toContain('duration=14D');
  });
});
