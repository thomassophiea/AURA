import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const driftMock = vi.hoisted((): { driftDetectionService: any } => ({
  driftDetectionService: {
    checkAll: vi.fn(),
    checkTemplate: vi.fn(),
  },
}));

vi.mock('../services/driftDetectionService', () => driftMock);

beforeEach(() => {
  driftMock.driftDetectionService.checkAll.mockReset();
  driftMock.driftDetectionService.checkTemplate.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

import { useDriftDetection } from './useDriftDetection';

const baseTemplate = (id: string) =>
  ({
    id,
    name: `Template ${id}`,
    element_type: 'service',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

describe('useDriftDetection', () => {
  it('initial state: no summary, not loading, no error', () => {
    const { result } = renderHook(() => useDriftDetection([], [], [], [], []));
    expect(result.current.summary).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('checkAll() stores the summary returned by the service', async () => {
    const summary = {
      total: 4,
      in_sync: 3,
      drifted: 1,
      missing: 0,
      errors: 0,
      results: [],
      checked_at: '2026-05-09T00:00:00Z',
    };
    driftMock.driftDetectionService.checkAll.mockResolvedValue(summary);

    const { result } = renderHook(() => useDriftDetection([], [], [], [], []));
    await act(async () => {
      await result.current.checkAll();
    });
    expect(result.current.summary).toEqual(summary);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('checkAll() captures the error from a thrown service call', async () => {
    driftMock.driftDetectionService.checkAll.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useDriftDetection([], [], [], [], []));
    await act(async () => {
      await result.current.checkAll();
    });
    expect(result.current.error).toBe('network down');
    expect(result.current.summary).toBeNull();
  });

  it('checkAll() uses the fallback error string for non-Error throws', async () => {
    driftMock.driftDetectionService.checkAll.mockRejectedValue('string error');

    const { result } = renderHook(() => useDriftDetection([], [], [], [], []));
    await act(async () => {
      await result.current.checkAll();
    });
    expect(result.current.error).toBe('Drift check failed');
  });

  it('checkTemplate() builds a fresh summary when none exists', async () => {
    driftMock.driftDetectionService.checkTemplate.mockResolvedValue([
      { template_id: 't-1', status: 'in_sync' },
      { template_id: 't-1', status: 'drifted' },
      { template_id: 't-1', status: 'missing' },
      { template_id: 't-1', status: 'error' },
    ]);

    const { result } = renderHook(() => useDriftDetection([], [], [], [], []));
    await act(async () => {
      await result.current.checkTemplate(baseTemplate('t-1'));
    });
    expect(result.current.summary?.total).toBe(4);
    expect(result.current.summary?.in_sync).toBe(1);
    expect(result.current.summary?.drifted).toBe(1);
    expect(result.current.summary?.missing).toBe(1);
    expect(result.current.summary?.errors).toBe(1);
  });

  it('checkTemplate() merges into an existing summary, replacing the same template', async () => {
    driftMock.driftDetectionService.checkTemplate
      .mockResolvedValueOnce([
        { template_id: 't-1', status: 'in_sync' },
        { template_id: 't-1', status: 'drifted' },
      ])
      .mockResolvedValueOnce([
        // Re-check t-1 → its old results should be replaced
        { template_id: 't-1', status: 'in_sync' },
        { template_id: 't-1', status: 'in_sync' },
      ]);

    const { result } = renderHook(() => useDriftDetection([], [], [], [], []));
    await act(async () => {
      await result.current.checkTemplate(baseTemplate('t-1'));
    });
    expect(result.current.summary?.drifted).toBe(1);

    await act(async () => {
      await result.current.checkTemplate(baseTemplate('t-1'));
    });
    expect(result.current.summary?.in_sync).toBe(2);
    expect(result.current.summary?.drifted).toBe(0);
  });

  it('checkTemplate() merges with results from other templates preserved', async () => {
    driftMock.driftDetectionService.checkTemplate
      .mockResolvedValueOnce([{ template_id: 't-1', status: 'in_sync' }])
      .mockResolvedValueOnce([{ template_id: 't-2', status: 'drifted' }]);

    const { result } = renderHook(() => useDriftDetection([], [], [], [], []));
    await act(async () => {
      await result.current.checkTemplate(baseTemplate('t-1'));
    });
    await act(async () => {
      await result.current.checkTemplate(baseTemplate('t-2'));
    });
    expect(result.current.summary?.total).toBe(2);
    expect(result.current.summary?.in_sync).toBe(1);
    expect(result.current.summary?.drifted).toBe(1);
  });

  it('checkTemplate() returns the result array verbatim', async () => {
    const results = [{ template_id: 't-1', status: 'in_sync' as const }];
    driftMock.driftDetectionService.checkTemplate.mockResolvedValue(results);

    const { result } = renderHook(() => useDriftDetection([], [], [], [], []));
    let returned;
    await act(async () => {
      returned = await result.current.checkTemplate(baseTemplate('t-1'));
    });
    expect(returned).toEqual(results);
  });

  it('checkTemplate() returns [] and sets error on failure', async () => {
    driftMock.driftDetectionService.checkTemplate.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useDriftDetection([], [], [], [], []));
    let returned;
    await act(async () => {
      returned = await result.current.checkTemplate(baseTemplate('t-1'));
    });
    expect(returned).toEqual([]);
    expect(result.current.error).toBe('boom');
  });
});
