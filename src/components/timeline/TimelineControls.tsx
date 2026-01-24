import { Lock, Unlock, X, Copy, Info } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { useState } from 'react';
import { cn } from '../ui/utils';

interface TimelineControlsProps {
  currentTime: number | null;
  isLocked: boolean;
  hasTimeWindow: boolean;
  onToggleLock: () => void;
  onClearTimeWindow: () => void;
  onCopyTimeline?: () => void;
  sourceLabel?: string;
}

export function TimelineControls({
  currentTime,
  isLocked,
  hasTimeWindow,
  onToggleLock,
  onClearTimeWindow,
  onCopyTimeline,
  sourceLabel,
}: TimelineControlsProps) {
  const [showHelp, setShowHelp] = useState(false);

  const formatTimestamp = (timestamp: number | null): string => {
    if (timestamp === null) return 'No time selected';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatTimeWindow = (start: number | null, end: number | null): string => {
    if (start === null || end === null) return '';
    const duration = Math.abs(end - start) / 1000;
    if (duration < 60) return `${duration.toFixed(0)}s`;
    if (duration < 3600) return `${(duration / 60).toFixed(1)}m`;
    return `${(duration / 3600).toFixed(1)}h`;
  };

  return (
    <div className="flex flex-col border-b border-border">
      <div className="flex items-center justify-between px-4 py-2 bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="text-sm min-w-[180px]">
            <span className="text-muted-foreground">Time: </span>
            <span className="font-medium">{formatTimestamp(currentTime)}</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={isLocked ? 'default' : 'secondary'}
              size="sm"
              onClick={onToggleLock}
              className={cn(
                "gap-2 min-w-[100px] font-semibold transition-all",
                isLocked && "bg-violet-600 hover:bg-violet-700 text-white shadow-md",
                !isLocked && currentTime !== null && "border-violet-400 hover:border-violet-600"
              )}
              title={isLocked ? 'Click to unlock and enable hover tracking' : currentTime === null ? 'Hover over a chart first, then click to lock' : 'Click to lock at this time'}
            >
              {isLocked ? (
                <>
                  <Lock className="h-4 w-4" />
                  Locked
                </>
              ) : (
                <>
                  <Unlock className="h-4 w-4" />
                  {currentTime === null ? 'Hover Chart' : 'Click to Lock'}
                </>
              )}
            </Button>

            {hasTimeWindow && (
              <Badge variant="secondary" className="text-xs px-2 py-1">
                Window: {formatTimeWindow(currentTime, currentTime)}
              </Badge>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHelp(!showHelp)}
            className="gap-2"
            title="Show timeline help"
          >
            <Info className="h-4 w-4" />
            {showHelp ? 'Hide' : 'Help'}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {onCopyTimeline && (currentTime !== null || hasTimeWindow) && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCopyTimeline}
              className="gap-2"
              title={`Copy this timeline to ${sourceLabel || 'other insights'}`}
            >
              <Copy className="h-4 w-4" />
              Copy to {sourceLabel || 'Other'}
            </Button>
          )}
          {hasTimeWindow && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearTimeWindow}
              className="gap-2"
              title="Clear time window selection"
            >
              <X className="h-4 w-4" />
              Clear Selection
            </Button>
          )}
          <div className="text-xs text-muted-foreground">
            {isLocked && '🔒 Timeline locked'}
            {!isLocked && currentTime === null && 'Hover over charts to select time'}
            {!isLocked && currentTime !== null && 'Click lock to freeze'}
          </div>
        </div>
      </div>

      {showHelp && (
        <div className="px-4 py-3 bg-blue-500/5 border-t border-blue-500/20">
          <div className="text-sm space-y-2">
            <div className="font-semibold text-blue-600 dark:text-blue-400">Timeline Navigation Guide:</div>
            <ul className="space-y-1.5 text-xs text-muted-foreground ml-4">
              <li><strong>Hover:</strong> Move mouse over any chart to track time across all charts</li>
              <li><strong>Lock:</strong> Click Lock button to freeze the current time position</li>
              <li><strong>Time Window Selection:</strong> Hold <kbd className="px-1.5 py-0.5 bg-muted border rounded text-xs font-mono">Shift</kbd> + drag across any chart to select a time range</li>
              <li><strong>Copy Timeline:</strong> Use "Copy to..." button to sync this timeline to other insights pages</li>
              <li><strong>Clear:</strong> Click "Clear Selection" to remove time window highlights</li>
              <li><strong>Correlation:</strong> Lock a time in Client Insights, copy to AP Insights to compare data at the same moment</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
