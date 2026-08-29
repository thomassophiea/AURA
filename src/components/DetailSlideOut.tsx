import { ReactNode } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './ui/sheet';

interface DetailSlideOutProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  width?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
}

export function DetailSlideOut({
  isOpen,
  onClose,
  title,
  description,
  children,
  width = '2xl', // Changed default to 2xl for better visibility
}: DetailSlideOutProps) {
  /**
   * Widths must carry the `sm:` prefix.
   *
   * `SheetContent` sets `sm:max-w-sm` in its own base classes. Tailwind emits
   * responsive variants *after* unprefixed utilities, so at any viewport ≥640px
   * an unprefixed `max-w-2xl` here loses the cascade to that `sm:max-w-sm` and
   * every slide-out renders at 384px regardless of the width asked for — which
   * is what crushed the Access Point Details panel into two unreadable columns.
   * Prefixing puts these rules in the same media query, where the later one
   * (this) wins. Every other Sheet in the app already does it this way.
   */
  const widthClasses = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-md',
    lg: 'sm:max-w-lg',
    xl: 'sm:max-w-xl',
    '2xl': 'sm:max-w-2xl',
    '3xl': 'sm:max-w-3xl',
    '4xl': 'sm:max-w-4xl',
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose} modal={false}>
      <SheetContent
        side="right"
        className={`${widthClasses[width]} w-full p-0 flex flex-col`}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <SheetHeader className="px-6 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg font-semibold truncate" title={typeof title === 'string' ? title : undefined}>
                {title}
              </SheetTitle>
              {description && (
                <SheetDescription className="mt-1 text-sm text-muted-foreground">
                  {description}
                </SheetDescription>
              )}
            </div>
          </div>
        </SheetHeader>

        {/* A container, so panel content can lay itself out against the panel's
            own width. A viewport breakpoint (`md:`) is the wrong tool in here:
            it reports 1600px while the panel is 672px, which is how the Access
            Point Details cards ended up two-across in a column too narrow to
            hold a serial number. */}
        <div className="@container flex-1 overflow-y-auto min-h-0 px-6 py-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
