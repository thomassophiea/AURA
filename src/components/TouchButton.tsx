/**
 * Touch-Friendly Button Component
 *
 * Automatically increases size on touch devices to meet 44x44px minimum tap target
 */

import { forwardRef } from 'react';
import { useIsTouchDevice } from '@/hooks/useDeviceDetection';
import { Button, ButtonProps } from '@/components/ui/button';
import { cn } from '@/components/ui/utils';

export interface TouchButtonProps extends ButtonProps {
  forceTouchSize?: boolean; // Force touch size even on non-touch devices
}

export const TouchButton = forwardRef<HTMLButtonElement, TouchButtonProps>(
  ({ className, size, forceTouchSize = false, ...props }, ref) => {
    const isTouchDevice = useIsTouchDevice();

    const shouldUseTouchSize = isTouchDevice || forceTouchSize;

    // Auto-upgrade size on touch devices if size is "sm" or "icon"
    let adjustedSize = size;
    if (shouldUseTouchSize && (size === 'sm' || size === 'icon')) {
      adjustedSize = 'default';
    }

    return (
      <Button
        ref={ref}
        size={adjustedSize}
        className={cn(
          shouldUseTouchSize && 'min-h-[44px] min-w-[44px]',
          className
        )}
        {...props}
      />
    );
  }
);

TouchButton.displayName = 'TouchButton';
