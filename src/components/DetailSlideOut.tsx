import { ReactNode } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './ui/sheet';
import { Button } from './ui/button';
import { X } from 'lucide-react';

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
  width = '2xl'  // Changed default to 2xl for better visibility
}: DetailSlideOutProps) {
  const widthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl'
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
              <SheetTitle className="text-lg font-semibold truncate">
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
        
        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}