/**
 * Responsive Dialog Component
 *
 * Automatically renders as:
 * - Mobile: Bottom sheet (90% height)
 * - Desktop: Standard dialog
 */

import { ReactNode } from 'react';
import { useIsMobile } from '@/hooks/useDeviceDetection';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

export interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
}

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  full: 'max-w-full',
};

export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className = '',
  maxWidth = 'lg',
}: ResponsiveDialogProps) {
  const isMobile = useIsMobile();

  const header = title || description ? (
    isMobile ? (
      <SheetHeader>
        {title && <SheetTitle>{title}</SheetTitle>}
        {description && <SheetDescription>{description}</SheetDescription>}
      </SheetHeader>
    ) : (
      <DialogHeader>
        {title && <DialogTitle>{title}</DialogTitle>}
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
    )
  ) : null;

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className={`h-[90vh] overflow-y-auto ${className}`}
        >
          {header}
          <div className="mt-4">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${maxWidthClasses[maxWidth]} ${className}`}>
        {header}
        <div className={title || description ? 'mt-4' : ''}>{children}</div>
      </DialogContent>
    </Dialog>
  );
}
