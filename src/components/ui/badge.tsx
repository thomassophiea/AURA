import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from './utils';

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
        secondary: 'border-border bg-muted text-foreground [a&]:hover:bg-muted/80',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground [a&]:hover:bg-destructive/90',
        outline:
          'border-border text-foreground bg-transparent [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
        success:
          'bg-[var(--status-success,#438035)]/15 text-[var(--status-success,#438035)] border-[var(--status-success,#438035)]/30',
        warning:
          'bg-[var(--status-warning,#946b18)]/15 text-[var(--status-warning,#946b18)] border-[var(--status-warning,#946b18)]/30',
        info: 'bg-[var(--status-info,#665cdd)]/15 text-[var(--status-info,#665cdd)] border-[var(--status-info,#665cdd)]/30',
        critical:
          'bg-[var(--status-error,#d92317)]/15 text-[var(--status-error,#d92317)] border-[var(--status-error,#d92317)]/30',
        offline:
          'bg-[var(--status-offline,#666b85)]/15 text-[var(--status-offline,#666b85)] border-[var(--status-offline,#666b85)]/30',
        neutral:
          'bg-[var(--status-neutral,#6a6f7f)]/15 text-[var(--status-neutral,#6a6f7f)] border-[var(--status-neutral,#6a6f7f)]/30',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

const Badge = React.forwardRef<
  HTMLSpanElement,
  React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }
>(({ className, variant, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'span';

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      ref={ref}
      {...props}
    />
  );
});

Badge.displayName = 'Badge';

export { Badge, badgeVariants };
