'use client';

import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';

import { cn } from './utils';

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-5 shrink-0 items-center rounded-full border-2 border-transparent transition-all outline-none cursor-pointer',
        'focus-visible:border-ring focus-visible:ring-ring focus-visible:ring-[3px]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:bg-primary data-[state=unchecked]:bg-switch-background',
        'dark:data-[state=unchecked]:bg-input/80',
        className
      )}
      style={{ width: 36 }}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'bg-card shadow-md pointer-events-none block rounded-full ring-0 transition-transform',
          'data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0'
        )}
        style={{ width: 16, height: 16 }}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
