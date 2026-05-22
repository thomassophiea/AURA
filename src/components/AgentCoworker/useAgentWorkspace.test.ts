import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAgentWorkspace } from './useAgentWorkspace';

beforeEach(() => {
  localStorage.clear();
});

describe('useAgentWorkspace primaryTab', () => {
  it('defaults to terminal', () => {
    const { result } = renderHook(() => useAgentWorkspace());
    expect(result.current.primaryTab).toBe('terminal');
  });

  it('setPrimaryTab switches to ops', () => {
    const { result } = renderHook(() => useAgentWorkspace());
    act(() => {
      result.current.setPrimaryTab('ops');
    });
    expect(result.current.primaryTab).toBe('ops');
  });
});
