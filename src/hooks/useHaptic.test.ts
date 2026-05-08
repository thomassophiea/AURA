import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHaptic } from './useHaptic';

let vibrateMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vibrateMock = vi.fn();
  Object.defineProperty(navigator, 'vibrate', {
    value: vibrateMock,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useHaptic', () => {
  it('exposes light/medium/heavy/success/warning/error', () => {
    const { result } = renderHook(() => useHaptic());
    expect(typeof result.current.light).toBe('function');
    expect(typeof result.current.medium).toBe('function');
    expect(typeof result.current.heavy).toBe('function');
    expect(typeof result.current.success).toBe('function');
    expect(typeof result.current.warning).toBe('function');
    expect(typeof result.current.error).toBe('function');
  });

  it('light fires a 10ms vibrate', () => {
    const { result } = renderHook(() => useHaptic());
    result.current.light();
    expect(vibrateMock).toHaveBeenCalledWith(10);
  });

  it('medium fires a 20ms vibrate', () => {
    const { result } = renderHook(() => useHaptic());
    result.current.medium();
    expect(vibrateMock).toHaveBeenCalledWith(20);
  });

  it('heavy fires a 30ms vibrate', () => {
    const { result } = renderHook(() => useHaptic());
    result.current.heavy();
    expect(vibrateMock).toHaveBeenCalledWith(30);
  });

  it('success fires a 3-step pattern', () => {
    const { result } = renderHook(() => useHaptic());
    result.current.success();
    expect(vibrateMock).toHaveBeenCalledWith([10, 50, 10]);
  });

  it('warning fires a 5-step pattern', () => {
    const { result } = renderHook(() => useHaptic());
    result.current.warning();
    expect(vibrateMock).toHaveBeenCalledWith([10, 100, 10, 100, 10]);
  });

  it('error fires a 3-step pattern with 20ms bookends', () => {
    const { result } = renderHook(() => useHaptic());
    result.current.error();
    expect(vibrateMock).toHaveBeenCalledWith([20, 100, 20]);
  });

  it('is a no-op when navigator.vibrate is unavailable', () => {
    delete (navigator as unknown as { vibrate?: unknown }).vibrate;
    const { result } = renderHook(() => useHaptic());
    expect(() => result.current.light()).not.toThrow();
  });
});
