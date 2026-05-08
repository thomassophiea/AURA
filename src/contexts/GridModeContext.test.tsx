import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { GridModeProvider, useGridMode } from './GridModeContext';

describe('useGridMode', () => {
  it('returns agGridEnabled=true outside the provider (default)', () => {
    const { result } = renderHook(() => useGridMode());
    expect(result.current.agGridEnabled).toBe(true);
    expect(typeof result.current.toggleGridMode).toBe('function');
  });

  it('returns agGridEnabled=true inside the provider', () => {
    const { result } = renderHook(() => useGridMode(), {
      wrapper: ({ children }) => <GridModeProvider>{children}</GridModeProvider>,
    });
    expect(result.current.agGridEnabled).toBe(true);
  });

  it('toggleGridMode is a no-op (does not throw)', () => {
    const { result } = renderHook(() => useGridMode());
    expect(() => result.current.toggleGridMode()).not.toThrow();
    expect(result.current.agGridEnabled).toBe(true);
  });
});
