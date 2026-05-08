import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useDeviceDetection,
  useIsMobile,
  useIsTablet,
  useIsTouchDevice,
} from './useDeviceDetection';

function setWindowSize(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, writable: true, configurable: true });
  Object.defineProperty(window, 'innerHeight', {
    value: height,
    writable: true,
    configurable: true,
  });
}

function setTouchCapability(hasTouch: boolean) {
  if (hasTouch) {
    Object.defineProperty(window, 'ontouchstart', {
      value: () => {},
      writable: true,
      configurable: true,
    });
  } else {
    delete (window as unknown as Record<string, unknown>).ontouchstart;
  }
  Object.defineProperty(navigator, 'maxTouchPoints', {
    value: hasTouch ? 5 : 0,
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  setWindowSize(1280, 800);
  setTouchCapability(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useDeviceDetection — screen size buckets', () => {
  it('returns xs when below sm breakpoint', () => {
    setWindowSize(320, 600);
    const { result } = renderHook(() => useDeviceDetection());
    expect(result.current.screenSize).toBe('xs');
  });

  it('returns sm at the sm breakpoint (640)', () => {
    setWindowSize(640, 800);
    const { result } = renderHook(() => useDeviceDetection());
    expect(result.current.screenSize).toBe('sm');
  });

  it('returns md at the md breakpoint (768)', () => {
    setWindowSize(768, 800);
    const { result } = renderHook(() => useDeviceDetection());
    expect(result.current.screenSize).toBe('md');
  });

  it('returns lg at the lg breakpoint (1024)', () => {
    setWindowSize(1024, 800);
    const { result } = renderHook(() => useDeviceDetection());
    expect(result.current.screenSize).toBe('lg');
  });

  it('returns xl at the xl breakpoint (1280)', () => {
    setWindowSize(1280, 800);
    const { result } = renderHook(() => useDeviceDetection());
    expect(result.current.screenSize).toBe('xl');
  });

  it('returns 2xl at the 2xl breakpoint (1536)', () => {
    setWindowSize(1536, 1000);
    const { result } = renderHook(() => useDeviceDetection());
    expect(result.current.screenSize).toBe('2xl');
  });
});

describe('useDeviceDetection — device class', () => {
  it('isMobile is true below 768px', () => {
    setWindowSize(500, 800);
    const { result } = renderHook(() => useDeviceDetection());
    expect(result.current.isMobile).toBe(true);
    expect(result.current.isTablet).toBe(false);
    expect(result.current.isDesktop).toBe(false);
  });

  it('isTablet is true at 768..1023', () => {
    setWindowSize(900, 800);
    const { result } = renderHook(() => useDeviceDetection());
    expect(result.current.isTablet).toBe(true);
    expect(result.current.isMobile).toBe(false);
    expect(result.current.isDesktop).toBe(false);
  });

  it('isDesktop is true at >= 1024', () => {
    setWindowSize(1500, 1000);
    const { result } = renderHook(() => useDeviceDetection());
    expect(result.current.isDesktop).toBe(true);
    expect(result.current.isMobile).toBe(false);
    expect(result.current.isTablet).toBe(false);
  });
});

describe('useDeviceDetection — orientation', () => {
  it('landscape when width > height', () => {
    setWindowSize(1024, 768);
    const { result } = renderHook(() => useDeviceDetection());
    expect(result.current.orientation).toBe('landscape');
  });

  it('portrait when height >= width', () => {
    setWindowSize(600, 900);
    const { result } = renderHook(() => useDeviceDetection());
    expect(result.current.orientation).toBe('portrait');
  });
});

describe('useDeviceDetection — touch detection', () => {
  it('isTouchDevice false when no touch APIs present', () => {
    setTouchCapability(false);
    const { result } = renderHook(() => useDeviceDetection());
    expect(result.current.isTouchDevice).toBe(false);
  });

  it('isTouchDevice true when ontouchstart is present', () => {
    setTouchCapability(true);
    const { result } = renderHook(() => useDeviceDetection());
    expect(result.current.isTouchDevice).toBe(true);
  });
});

describe('useDeviceDetection — re-renders on window events', () => {
  it('updates state on window resize', () => {
    setWindowSize(320, 600);
    const { result } = renderHook(() => useDeviceDetection());
    expect(result.current.screenSize).toBe('xs');
    act(() => {
      setWindowSize(1500, 900);
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current.screenSize).toBe('xl');
  });

  it('updates state on orientationchange', () => {
    setWindowSize(800, 1200);
    const { result } = renderHook(() => useDeviceDetection());
    expect(result.current.orientation).toBe('portrait');
    act(() => {
      setWindowSize(1200, 800);
      window.dispatchEvent(new Event('orientationchange'));
    });
    expect(result.current.orientation).toBe('landscape');
  });
});

describe('useIsMobile / useIsTablet / useIsTouchDevice convenience hooks', () => {
  it('useIsMobile returns the same as the parent hook', () => {
    setWindowSize(400, 800);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('useIsTablet returns the same as the parent hook', () => {
    setWindowSize(800, 1000);
    const { result } = renderHook(() => useIsTablet());
    expect(result.current).toBe(true);
  });

  it('useIsTouchDevice returns the same as the parent hook', () => {
    setTouchCapability(true);
    const { result } = renderHook(() => useIsTouchDevice());
    expect(result.current).toBe(true);
  });
});
