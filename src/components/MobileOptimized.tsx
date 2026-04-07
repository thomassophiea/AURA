/**
 * Mobile Optimization Wrapper
 *
 * Provides mobile-specific optimizations without drastically changing desktop experience
 */

import { ReactNode } from 'react';
import { useDeviceDetection } from '@/hooks/useDeviceDetection';

interface MobileOptimizedProps {
  children: ReactNode;
  mobileChildren?: ReactNode;
  className?: string;
}

/**
 * Renders different content for mobile vs desktop
 * Use sparingly - prefer responsive CSS when possible
 */
export function MobileOptimized({
  children,
  mobileChildren,
  className = '',
}: MobileOptimizedProps) {
  const { isMobile } = useDeviceDetection();

  return (
    <div className={className}>
      {isMobile && mobileChildren ? mobileChildren : children}
    </div>
  );
}

/**
 * Only renders children on mobile devices
 */
export function MobileOnly({ children }: { children: ReactNode }) {
  const { isMobile } = useDeviceDetection();
  return isMobile ? <>{children}</> : null;
}

/**
 * Only renders children on desktop/tablet devices
 */
export function DesktopOnly({ children }: { children: ReactNode }) {
  const { isMobile } = useDeviceDetection();
  return !isMobile ? <>{children}</> : null;
}

/**
 * Only renders children on touch devices
 */
export function TouchOnly({ children }: { children: ReactNode }) {
  const { isTouchDevice } = useDeviceDetection();
  return isTouchDevice ? <>{children}</> : null;
}

/**
 * Higher-order component for mobile optimization
 */
export function withMobileOptimization<P extends object>(
  Component: React.ComponentType<P>,
  MobileComponent?: React.ComponentType<P>
) {
  return function MobileOptimizedComponent(props: P) {
    const { isMobile } = useDeviceDetection();

    if (isMobile && MobileComponent) {
      return <MobileComponent {...props} />;
    }

    return <Component {...props} />;
  };
}
