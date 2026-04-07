/**
 * Responsive Chart Wrapper
 *
 * Automatically optimizes charts for mobile:
 * - Reduced height
 * - Simplified axes
 * - Fewer data points
 * - Larger touch targets
 */

import { ReactNode } from 'react';
import { useDeviceDetection } from '@/hooks/useDeviceDetection';
import { ResponsiveContainer } from 'recharts';

export interface ResponsiveChartProps {
  children: ReactNode;
  mobileHeight?: number;
  desktopHeight?: number;
  className?: string;
}

export function ResponsiveChart({
  children,
  mobileHeight = 250,
  desktopHeight = 400,
  className = '',
}: ResponsiveChartProps) {
  const { isMobile } = useDeviceDetection();

  return (
    <div className={className}>
      <ResponsiveContainer
        width="100%"
        height={isMobile ? mobileHeight : desktopHeight}
      >
        {children}
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Hook for chart configuration that adjusts based on device
 */
export function useChartConfig() {
  const { isMobile } = useDeviceDetection();

  return {
    // Reduce stroke width on mobile for performance
    strokeWidth: isMobile ? 2 : 3,

    // Increase dot size on mobile for touch
    dotRadius: isMobile ? 4 : 3,

    // Reduce axis tick count on mobile
    tickCount: isMobile ? 4 : 8,

    // Axis label font size
    fontSize: isMobile ? 10 : 12,

    // Axis width/height
    axisWidth: isMobile ? 40 : 60,
    axisHeight: isMobile ? 30 : 40,

    // Show/hide legend on mobile
    showLegend: !isMobile,

    // Animation duration
    animationDuration: isMobile ? 500 : 800,

    // Data point interval (show every nth point on mobile)
    dataInterval: isMobile ? 2 : 0,
  };
}
