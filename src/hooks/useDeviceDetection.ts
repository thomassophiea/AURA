/**
 * Enhanced Device Detection Hook
 *
 * Detects device type, capabilities, and screen size for responsive optimization
 */

import { useState, useEffect } from 'react';

export interface DeviceInfo {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouchDevice: boolean;
  screenSize: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  orientation: 'portrait' | 'landscape';
}

const BREAKPOINTS = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

export function useDeviceDetection(): DeviceInfo {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(() => {
    if (typeof window === 'undefined') {
      return {
        isMobile: false,
        isTablet: false,
        isDesktop: true,
        isTouchDevice: false,
        screenSize: 'lg',
        orientation: 'landscape',
      };
    }

    return detectDevice();
  });

  useEffect(() => {
    const handleResize = () => {
      setDeviceInfo(detectDevice());
    };

    const handleOrientationChange = () => {
      setDeviceInfo(detectDevice());
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, []);

  return deviceInfo;
}

function detectDevice(): DeviceInfo {
  const width = window.innerWidth;
  const height = window.innerHeight;

  // Detect touch capability
  const isTouchDevice =
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    // @ts-ignore - legacy IE
    (navigator.msMaxTouchPoints || 0) > 0;

  // Determine screen size
  let screenSize: DeviceInfo['screenSize'] = 'xs';
  if (width >= BREAKPOINTS['2xl']) screenSize = '2xl';
  else if (width >= BREAKPOINTS.xl) screenSize = 'xl';
  else if (width >= BREAKPOINTS.lg) screenSize = 'lg';
  else if (width >= BREAKPOINTS.md) screenSize = 'md';
  else if (width >= BREAKPOINTS.sm) screenSize = 'sm';

  // Determine device type
  const isMobile = width < BREAKPOINTS.md; // < 768px
  const isTablet = width >= BREAKPOINTS.md && width < BREAKPOINTS.lg; // 768px - 1024px
  const isDesktop = width >= BREAKPOINTS.lg; // >= 1024px

  // Determine orientation
  const orientation: DeviceInfo['orientation'] =
    width > height ? 'landscape' : 'portrait';

  return {
    isMobile,
    isTablet,
    isDesktop,
    isTouchDevice,
    screenSize,
    orientation,
  };
}

// Convenience hook for simple mobile detection
export function useIsMobile(): boolean {
  const { isMobile } = useDeviceDetection();
  return isMobile;
}

// Convenience hook for tablet detection
export function useIsTablet(): boolean {
  const { isTablet } = useDeviceDetection();
  return isTablet;
}

// Convenience hook for touch device detection
export function useIsTouchDevice(): boolean {
  const { isTouchDevice } = useDeviceDetection();
  return isTouchDevice;
}
