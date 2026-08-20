import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const getAccessPoints = vi.fn();
vi.mock('@/services/api', () => ({
  apiService: {
    getAccessPoints: (...args: unknown[]) => getAccessPoints(...args),
  },
}));

import { useApModels } from './useApModels';

describe('useApModels', () => {
  beforeEach(() => getAccessPoints.mockReset());
  afterEach(() => vi.clearAllMocks());

  it('maps serial -> model, using fallback model fields', async () => {
    getAccessPoints.mockResolvedValue([
      { serialNumber: 's1', model: 'AP5020' },
      { serialNumber: 's2', platformName: 'AP4020X' },
      { serialNumber: 's3' }, // no model → skipped
      { model: 'AP4060' }, // no serial → skipped
    ]);
    const { result } = renderHook(() => useApModels());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.modelBySerial.get('s1')).toBe('AP5020');
    expect(result.current.modelBySerial.get('s2')).toBe('AP4020X');
    expect(result.current.modelBySerial.size).toBe(2);
  });
});
