import React, { useState, useRef } from 'react';
import { GripVertical } from 'lucide-react';
import { cn } from '../ui/utils';

interface DraggableWidgetProps {
  id: string;
  index: number;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  isDropTarget: boolean;
  children: React.ReactNode;
  className?: string;
}

export function DraggableWidget({
  id,
  index,
  onDragStart,
  onDragOver,
  onDragEnd,
  isDragging,
  isDropTarget,
  children,
  className,
}: DraggableWidgetProps) {
  const [isHovered, setIsHovered] = useState(false);
  const dragHandleRef = useRef<HTMLDivElement>(null);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
    onDragStart(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    onDragOver(index);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div
      data-widget-id={id}
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={onDragEnd}
      onDrop={handleDrop}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'relative transition-all duration-200',
        isDragging && 'opacity-50 scale-[0.98]',
        isDropTarget && !isDragging && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        className
      )}
    >
      <div
        ref={dragHandleRef}
        className={cn(
          'absolute -left-2 top-1/2 -translate-y-1/2 z-10',
          'p-1 rounded cursor-grab active:cursor-grabbing',
          'bg-background/80 border shadow-sm',
          'transition-opacity duration-200',
          isHovered || isDragging ? 'opacity-100' : 'opacity-0'
        )}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      {children}
    </div>
  );
}
