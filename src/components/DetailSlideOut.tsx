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
  width?: 'sm' | 'md' | 'lg' | 'xl';
}

export function DetailSlideOut({ 
  isOpen, 
  onClose, 
  title, 
  description, 
  children,
  width = 'lg'
}: DetailSlideOutProps) {
  const widthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md', 
    lg: 'max-w-lg',
    xl: 'max-w-xl'
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent 
        side="right" 
        className={`${widthClasses[width]} w-full p-0 flex flex-col`}
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
        
        <div className="flex-1 overflow-auto px-6 py-4">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}