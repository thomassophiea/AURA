'use client';

import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';

import { cn } from './utils';

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-zinc-600/40 dark:data-[state=unchecked]:bg-zinc-500/30 focus-visible:border-ring focus-visible:ring-ring inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent data-[state=unchecked]:border-zinc-400/50 dark:data-[state=unchecked]:border-zinc-600 transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'bg-white shadow-md pointer-events-none block size-5 rounded-full ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0'
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
