'use client';

import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';

import { cn } from './utils';

function Switch({ className, style, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="aura-switch"
      className={cn(
        'aura-switch peer inline-flex shrink-0 items-center rounded-full transition-all outline-none cursor-pointer',
        'focus-visible:ring-ring focus-visible:ring-[3px]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      style={{ width: 36, height: 20, padding: 2, ...style }}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="aura-switch-thumb"
        className="aura-switch-thumb pointer-events-none block rounded-full transition-transform"
        style={{ width: 16, height: 16 }}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
