/**
 * Mobile Performance Optimization Utilities
 *
 * Utilities for improving performance on mobile devices
 */

/**
 * Reduces polling frequency on mobile devices to save battery
 */
export function getPollingInterval(defaultInterval: number): number {
  const isMobile = window.innerWidth < 768;
  return isMobile ? defaultInterval * 2 : defaultInterval;
}

/**
 * Limits the number of items displayed on mobile
 */
export function getPageSize(defaultSize: number): number {
  const isMobile = window.innerWidth < 768;
  return isMobile ? Math.min(defaultSize, 20) : defaultSize;
}

/**
 * Debounce function for search/filter inputs
 * Longer delay on mobile to reduce CPU usage
 */
export function getMobileDebounceDelay(): number {
  const isMobile = window.innerWidth < 768;
  return isMobile ? 500 : 300;
}

/**
 * Check if device has touch capability
 */
export function isTouchDevice(): boolean {
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    // @ts-ignore - legacy IE
    (navigator.msMaxTouchPoints || 0) > 0
  );
}

/**
 * Get appropriate image quality for device
 */
export function getImageQuality(): 'low' | 'medium' | 'high' {
  const isMobile = window.innerWidth < 768;
  const isSlowConnection =
    'connection' in navigator &&
    (navigator as any).connection?.effectiveType === '2g';

  if (isMobile || isSlowConnection) {
    return 'low';
  }

  return 'high';
}

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Get animation duration based on device and user preferences
 */
export function getAnimationDuration(defaultDuration: number): number {
  if (prefersReducedMotion()) {
    return 0;
  }

  const isMobile = window.innerWidth < 768;
  return isMobile ? defaultDuration * 0.7 : defaultDuration;
}

/**
 * Detect if device is on slow network
 */
export function isSlowNetwork(): boolean {
  if (!('connection' in navigator)) {
    return false;
  }

  const conn = (navigator as any).connection;
  const slowTypes = ['slow-2g', '2g'];
  return slowTypes.includes(conn?.effectiveType);
}

/**
 * Get chart data sampling rate for mobile
 * Returns how many data points to skip (0 = show all, 1 = skip every other, etc.)
 */
export function getChartSamplingRate(dataLength: number): number {
  const isMobile = window.innerWidth < 768;

  if (!isMobile) {
    return 0; // Show all data on desktop
  }

  // On mobile, reduce data points for better performance
  if (dataLength > 100) {
    return 4; // Show every 5th point
  } else if (dataLength > 50) {
    return 2; // Show every 3rd point
  } else if (dataLength > 20) {
    return 1; // Show every other point
  }

  return 0; // Show all if less than 20 points
}

/**
 * Get maximum concurrent API requests for device
 */
export function getMaxConcurrentRequests(): number {
  const isMobile = window.innerWidth < 768;
  return isMobile ? 2 : 6;
}

/**
 * Check if device battery is low
 */
export async function isLowBattery(): Promise<boolean> {
  if (!('getBattery' in navigator)) {
    return false;
  }

  try {
    const battery = await (navigator as any).getBattery();
    return battery.level < 0.2 && !battery.charging;
  } catch {
    return false;
  }
}

/**
 * Get refresh interval based on battery status
 */
export async function getAdaptiveRefreshInterval(
  defaultInterval: number
): Promise<number> {
  const lowBattery = await isLowBattery();
  const isMobile = window.innerWidth < 768;

  if (lowBattery) {
    return defaultInterval * 4; // Significantly reduce refresh rate on low battery
  }

  if (isMobile) {
    return defaultInterval * 2; // Moderate reduction on mobile
  }

  return defaultInterval;
}

/**
 * Lazy load image with mobile optimization
 */
export function getLazyLoadConfig() {
  const isMobile = window.innerWidth < 768;

  return {
    threshold: isMobile ? 0.1 : 0.5, // Load earlier on mobile
    rootMargin: isMobile ? '200px' : '100px', // Larger margin on mobile
  };
}

/**
 * Get virtualization config for lists
 */
export function getVirtualizationConfig(totalItems: number) {
  const isMobile = window.innerWidth < 768;

  return {
    enabled: totalItems > (isMobile ? 20 : 50),
    overscan: isMobile ? 5 : 10,
    estimateSize: isMobile ? 80 : 48,
  };
}

/**
 * Mobile-optimized console logging
 * Reduces logging on mobile to improve performance
 */
export const mobileLogger = {
  log: (...args: any[]) => {
    if (window.innerWidth >= 768 || process.env.NODE_ENV === 'development') {
      console.log(...args);
    }
  },
  warn: (...args: any[]) => {
    console.warn(...args); // Always show warnings
  },
  error: (...args: any[]) => {
    console.error(...args); // Always show errors
  },
};
