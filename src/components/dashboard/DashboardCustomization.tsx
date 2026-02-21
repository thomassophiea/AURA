import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { GripVertical, RotateCcw, Lock } from 'lucide-react';
import { cn } from '../ui/utils';
import type { DashboardWidget } from '../../hooks/useDashboardLayout';

interface DashboardCustomizationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  widgets: DashboardWidget[];
  onWidgetsChange: (widgets: DashboardWidget[]) => void;
  onToggleWidget: (widgetId: string) => void;
  onResetToDefault: () => void;
}

export function DashboardCustomization({
  open,
  onOpenChange,
  widgets,
  onWidgetsChange,
  onToggleWidget,
  onResetToDefault,
}: DashboardCustomizationProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const dragNodeRef = useRef<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    dragNodeRef.current = index;
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragNodeRef.current === null) return;
    if (dragNodeRef.current !== index) {
      setDropIndex(index);
    }
  };

  const handleDragEnd = () => {
    if (dragIndex !== null && dropIndex !== null && dragIndex !== dropIndex) {
      const updated = [...widgets];
      const [moved] = updated.splice(dragIndex, 1);
      updated.splice(dropIndex, 0, moved);
      onWidgetsChange(updated);
    }
    setDragIndex(null);
    setDropIndex(null);
    dragNodeRef.current = null;
  };

  const handleReset = () => {
    onResetToDefault();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Customize Dashboard</DialogTitle>
          <DialogDescription>
            Drag to reorder widgets. Toggle visibility with the switches.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 max-h-[400px] overflow-y-auto py-2">
          {widgets.map((widget, index) => (
            <div
              key={widget.id}
              draggable={!widget.locked}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg border transition-all',
                'bg-card hover:bg-accent/5',
                dragIndex === index && 'opacity-50 scale-[0.98]',
                dropIndex === index && dragIndex !== index && 'ring-2 ring-primary',
                widget.locked && 'bg-muted/30'
              )}
            >
              <div
                className={cn(
                  'cursor-grab active:cursor-grabbing',
                  widget.locked && 'cursor-not-allowed opacity-50'
                )}
              >
                <GripVertical className="h-4 w-4 text-muted-foreground" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">
                    {widget.name}
                  </span>
                  {widget.locked && (
                    <Lock className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>
              </div>

              <Switch
                checked={widget.visible}
                onCheckedChange={() => onToggleWidget(widget.id)}
                disabled={widget.locked}
                aria-label={`Toggle ${widget.name} visibility`}
              />
            </div>
          ))}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Reset to Default
          </Button>
          <Button onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
