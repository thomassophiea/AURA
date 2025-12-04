"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog@1.1.6";
import { XIcon } from "lucide-react@0.487.0";

import { cn } from "./utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragStart, setDragStart] = React.useState({ x: 0, y: 0 });
  const contentRef = React.useRef<HTMLDivElement>(null);

  React.useImperativeHandle(ref, () => contentRef.current!);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only start drag if clicking on the header area (detected by data-drag-handle attribute)
    const target = e.target as HTMLElement;

    // Don't drag if clicking on interactive elements
    if (target.closest('button, input, select, textarea, a')) {
      return;
    }

    if (!target.closest('[data-drag-handle="true"]')) {
      return;
    }

    e.preventDefault(); // Prevent text selection while dragging
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;

      // Get dialog dimensions
      const dialog = contentRef.current;
      if (!dialog) return;

      const rect = dialog.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Constrain to viewport bounds
      // Allow dialog to be dragged higher to reveal bottom content
      const constrainedX = Math.max(
        -rect.width / 2 + 50, // Allow some overflow on left
        Math.min(newX, viewportWidth - rect.width / 2 - 50) // Allow some overflow on right
      );
      const constrainedY = Math.max(
        -(rect.height - 100), // Allow dragging up to reveal bottom (keep 100px of header visible)
        Math.min(newY, viewportHeight - 100) // Keep at least 100px visible at bottom
      );

      setPosition({ x: constrainedX, y: constrainedY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

  // Smart positioning: center small dialogs, position tall dialogs higher
  const resetPosition = React.useCallback(() => {
    const dialog = contentRef.current;
    if (!dialog) {
      setPosition({ x: 0, y: 0 });
      return;
    }

    // Use multiple animation frames and a timeout to ensure content is fully rendered
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          const rect = dialog.getBoundingClientRect();
          const viewportHeight = window.innerHeight;

          console.log('📏 Dialog dimensions:', { height: rect.height, viewportHeight, threshold: viewportHeight * 0.7 });

          // Only proceed if dialog has actual dimensions (is rendered)
          if (rect.height === 0) {
            console.log('⚠️ Dialog height is 0, setting default position');
            setPosition({ x: 0, y: 0 });
            return;
          }

          // If dialog is tall (>70% of viewport), position it higher
          if (rect.height > viewportHeight * 0.7) {
            const targetY = -(rect.height / 2 - 150); // 150px from top
            console.log('📍 Tall dialog detected, positioning higher:', { targetY });
            setPosition({ x: 0, y: targetY });
          } else {
            console.log('📍 Small dialog detected, centering');
            setPosition({ x: 0, y: 0 });
          }
        }, 100); // Increased delay to ensure content is rendered
      });
    });
  }, []);

  // Reset position when dialog opens or when content changes
  React.useEffect(() => {
    resetPosition();
  }, [children, resetPosition]); // Reset whenever dialog content changes (typically on open)

  // Also reset on initial mount
  React.useEffect(() => {
    resetPosition();
  }, [resetPosition]);

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={contentRef}
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] max-h-[calc(100vh-2rem)] gap-4 rounded-lg border p-6 shadow-lg sm:max-w-lg overflow-y-auto",
          isDragging && "cursor-move select-none",
          className,
        )}
        style={{
          transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
          transition: isDragging ? 'none' : 'all 200ms',
        }}
        onMouseDown={handleMouseDown}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
          <XIcon />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-drag-handle="true"
    className={cn(
      "flex flex-col gap-2 text-center sm:text-left cursor-move select-none",
      "hover:bg-accent/5 active:bg-accent/10 rounded-md -mx-1 px-1 -mt-1 pt-1 transition-colors",
      className
    )}
    title="Click and drag to move"
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg leading-none font-semibold", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-muted-foreground text-sm", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
