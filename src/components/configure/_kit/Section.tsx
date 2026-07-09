/**
 * Titled group of FieldRows inside an editor tab; optionally collapsible for
 * advanced groups.
 */
import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../ui/collapsible';
import { Separator } from '../../ui/separator';
import { cn } from '../../ui/utils';

export interface SectionProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Section({
  title,
  description,
  collapsible,
  defaultOpen = true,
  className,
  children,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  const header = (
    <div className="space-y-0.5">
      <h3 className="text-sm font-medium">{title}</h3>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );

  if (!collapsible) {
    return (
      <section className={cn('space-y-4', className)}>
        {header}
        <Separator />
        <div className="space-y-4">{children}</div>
      </section>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn('space-y-4', className)}>
      <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
        {header}
        <ChevronDown
          className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </CollapsibleTrigger>
      <Separator />
      <CollapsibleContent className="space-y-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}
