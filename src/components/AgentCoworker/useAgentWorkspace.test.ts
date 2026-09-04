import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAgentWorkspace } from './useAgentWorkspace';

beforeEach(() => {
  localStorage.clear();
});

describe('useAgentWorkspace', () => {
  it('defaults to idle, standard size', () => {
    const { result } = renderHook(() => useAgentWorkspace());
    expect(result.current.mode).toBe('idle');
    expect(result.current.size).toBe('standard');
  });

  it('open/minimize/pin/dismiss set mode accordingly', () => {
    const { result } = renderHook(() => useAgentWorkspace());
    act(() => result.current.open());
    expect(result.current.mode).toBe('open');
    act(() => result.current.minimize());
    expect(result.current.mode).toBe('minimized');
    act(() => result.current.pin());
    expect(result.current.mode).toBe('pinned');
    act(() => result.current.dismiss());
    expect(result.current.mode).toBe('idle');
  });

  it('toggle flips between idle/minimized and open', () => {
    const { result } = renderHook(() => useAgentWorkspace());
    act(() => result.current.toggle());
    expect(result.current.mode).toBe('open');
    act(() => result.current.toggle());
    expect(result.current.mode).toBe('idle');
  });

  it('setSize updates the panel size', () => {
    const { result } = renderHook(() => useAgentWorkspace());
    act(() => result.current.setSize('expanded'));
    expect(result.current.size).toBe('expanded');
  });
});
