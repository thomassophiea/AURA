/**
 * Timeline Cursor Controls
 * 
 * Controls for the unified time cursor that synchronizes all charts.
 * - Shows current cursor timestamp
 * - Lock/unlock cursor
 * - Clear cursor
 * - Snap to events
 */

import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Lock, Unlock, X, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from './ui/utils';
import { useOperationalContext } from '../hooks/useOperationalContext';

interface TimelineCursorControlsProps {
  className?: string;
  showNavigation?: boolean;
  timeSeriesData?: Array<{ timestamp: number }>;
}

export function TimelineCursorControls({ 
  className, 
  showNavigation = false,
  timeSeriesData = []
}: TimelineCursorControlsProps) {
  const { 
    ctx, 
    setTimeCursor, 
    toggleCursorLock, 
    updateContext 
  } = useOperationalContext();
  
  const clearCursor = () => {
    updateContext({ timeCursor: null, cursorLocked: false });
  };
  
  const navigateCursor = (direction: 'prev' | 'next') => {
    if (!timeSeriesData.length) return;
    
    const sortedData = [...timeSeriesData].sort((a, b) => a.timestamp - b.timestamp);
    
    if (!ctx.timeCursor) {
      // Set to first or last
      setTimeCursor(direction === 'next' ? sortedData[0].timestamp : sortedData[sortedData.length - 1].timestamp);
      return;
    }
    
    const currentIndex = sortedData.findIndex(d => d.timestamp >= ctx.timeCursor!);
    
    if (direction === 'prev' && currentIndex > 0) {
      setTimeCursor(sortedData[currentIndex - 1].timestamp);
    } else if (direction === 'next' && currentIndex < sortedData.length - 1) {
      setTimeCursor(sortedData[currentIndex + 1].timestamp);
    }
  };
  
  const formatTimestamp = (ts: number): string => {
    const date = new Date(ts);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    return date.toLocaleString([], { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (!ctx.timeCursor) {
    return (
      <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
        <Clock className="h-3.5 w-3.5" />
        <span>Hover over charts to explore timeline</span>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Cursor timestamp */}
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-purple-500/10 border border-purple-500/20">
        <Clock className="h-3.5 w-3.5 text-purple-500" />
        <span className="text-sm font-mono text-purple-600">
          {formatTimestamp(ctx.timeCursor)}
        </span>
      </div>
      
      {/* Navigation buttons */}
      {showNavigation && timeSeriesData.length > 0 && (
        <div className="flex items-center">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7"
                  onClick={() => navigateCursor('prev')}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Previous data point</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7"
                  onClick={() => navigateCursor('next')}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Next data point</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
      
      {/* Lock button */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant={ctx.cursorLocked ? "default" : "outline"} 
              size="sm"
              className={cn(
                "h-7 gap-1",
                ctx.cursorLocked && "bg-primary hover:bg-primary/90"
              )}
              onClick={toggleCursorLock}
            >
              {ctx.cursorLocked ? (
                <>
                  <Lock className="h-3.5 w-3.5" />
                  <span className="text-xs">Locked</span>
                </>
              ) : (
                <>
                  <Unlock className="h-3.5 w-3.5" />
                  <span className="text-xs">Lock</span>
                </>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {ctx.cursorLocked 
              ? "Cursor locked - hover won't change time. Click to unlock." 
              : "Lock cursor to explore data at this time point"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      
      {/* Clear button */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon"
              className="h-7 w-7"
              onClick={clearCursor}
            >
              <X className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Clear cursor</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

/**
 * Compact version for embedding in chart headers
 */
export function TimelineCursorBadge({ className }: { className?: string }) {
  const { ctx } = useOperationalContext();
  
  if (!ctx.timeCursor) return null;
  
  return (
    <Badge 
      variant="outline" 
      className={cn(
        "text-xs font-mono gap-1",
        ctx.cursorLocked && "bg-purple-500/10 border-purple-500/30",
        className
      )}
    >
      {ctx.cursorLocked && <Lock className="h-3 w-3" />}
      {new Date(ctx.timeCursor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </Badge>
  );
}
