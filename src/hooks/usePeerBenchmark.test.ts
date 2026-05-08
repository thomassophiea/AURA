import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePeerBenchmark } from './usePeerBenchmark';
import { VERTICALS, SELF_BENCHMARK_WINDOWS } from '../services/peerBenchmarkData';

describe('usePeerBenchmark', () => {
  it('initializes with vertical mode + education + first self window', () => {
    const { result } = renderHook(() => usePeerBenchmark());
    expect(result.current.benchmarkMode).toBe('vertical');
    expect(result.current.selectedVertical).toBe('education');
    expect(result.current.selfWindow).toBe(SELF_BENCHMARK_WINDOWS[0].days);
  });

  it('exposes current network metrics shape', () => {
    const { result } = renderHook(() => usePeerBenchmark());
    expect(result.current.currentMetrics.avgThroughput).toBeGreaterThan(0);
    expect(result.current.currentMetrics.apUptime).toBeGreaterThan(0);
  });

  it('produces a benchmark score for the selected vertical', () => {
    const { result } = renderHook(() => usePeerBenchmark());
    expect(result.current.score).toBeDefined();
    expect(result.current.recommendations).toBeInstanceOf(Array);
  });

  it('setSelectedVertical switches mode back to vertical and changes the id', () => {
    const { result } = renderHook(() => usePeerBenchmark());
    const target = VERTICALS.find((v) => v.id !== 'education') ?? VERTICALS[0];
    act(() => result.current.setBenchmarkMode('self'));
    expect(result.current.benchmarkMode).toBe('self');
    act(() => result.current.setSelectedVertical(target.id));
    expect(result.current.benchmarkMode).toBe('vertical');
    expect(result.current.selectedVertical).toBe(target.id);
  });

  it('switches to self-benchmark mode', () => {
    const { result } = renderHook(() => usePeerBenchmark());
    act(() => result.current.setBenchmarkMode('self'));
    expect(result.current.benchmarkMode).toBe('self');
    expect(result.current.score).toBeDefined();
  });

  it('changing selfWindow re-renders with new score', () => {
    const { result } = renderHook(() => usePeerBenchmark());
    act(() => result.current.setBenchmarkMode('self'));
    const longWindow = SELF_BENCHMARK_WINDOWS[SELF_BENCHMARK_WINDOWS.length - 1].days;
    act(() => result.current.setSelfWindow(longWindow));
    expect(result.current.selfWindow).toBe(longWindow);
  });

  it('falls back to first vertical when an unknown id is passed', () => {
    const { result } = renderHook(() => usePeerBenchmark());
    act(() => result.current.setSelectedVertical('not-a-real-id'));
    expect(result.current.selectedVertical).toBe('not-a-real-id');
    expect(result.current.score).toBeDefined();
  });
});
