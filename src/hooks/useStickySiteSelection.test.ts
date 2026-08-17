import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useStickySiteSelection } from './useStickySiteSelection';

beforeEach(() => sessionStorage.clear());

describe('useStickySiteSelection', () => {
  it('starts on all sites when nothing is remembered', () => {
    const { result } = renderHook(() => useStickySiteSelection('access-points'));
    expect(result.current[0]).toBe('all');
  });

  it('remembers the selection across a remount — the navigation case', () => {
    const first = renderHook(() => useStickySiteSelection('access-points'));
    act(() => first.result.current[1]('PrimarySite'));
    first.unmount();

    const second = renderHook(() => useStickySiteSelection('access-points'));
    expect(second.result.current[0]).toBe('PrimarySite');
  });

  it('keeps pages that key sites differently from overwriting each other', () => {
    // Access Points selects by name, App Insights by id. One shared value would
    // hand each page a token the other cannot interpret.
    const aps = renderHook(() => useStickySiteSelection('access-points'));
    act(() => aps.result.current[1]('PrimarySite'));
    const insights = renderHook(() => useStickySiteSelection('app-insights'));
    act(() => insights.result.current[1]('84b3642f-a5d7-4dc9-b162-a6156c97b8f0'));

    aps.unmount();
    const apsAgain = renderHook(() => useStickySiteSelection('access-points'));
    expect(apsAgain.result.current[0]).toBe('PrimarySite');
    expect(insights.result.current[0]).toBe('84b3642f-a5d7-4dc9-b162-a6156c97b8f0');
  });

  it('remembers a system site like Staging too', () => {
    const { result, unmount } = renderHook(() => useStickySiteSelection('access-points'));
    act(() => result.current[1]('__os1_staging__'));
    unmount();
    expect(renderHook(() => useStickySiteSelection('access-points')).result.current[0]).toBe(
      '__os1_staging__'
    );
  });
});
