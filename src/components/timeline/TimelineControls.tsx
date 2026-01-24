import { Lock, Unlock, X, Copy, Info } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { useState } from 'react';

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
        <div className="flex items-center gap-4">
          <div className="text-sm">
            <span className="text-muted-foreground">Timeline: </span>
            <span className="font-medium">{formatTimestamp(currentTime)}</span>
            {hasTimeWindow && (
              <Badge variant="secondary" className="ml-2 text-xs">
                Window: {formatTimeWindow(currentTime, currentTime)}
              </Badge>
            )}
          </div>

          <Button
            variant={isLocked ? 'default' : 'outline'}
            size="sm"
            onClick={onToggleLock}
            className="gap-2"
            title={isLocked ? 'Unlock to enable hover tracking' : 'Lock to freeze current time'}
          >
            {isLocked ? (
              <>
                <Lock className="h-4 w-4" />
                Locked
              </>
            ) : (
              <>
                <Unlock className="h-4 w-4" />
                {currentTime === null ? 'Lock (hover to select)' : 'Unlocked'}
              </>
            )}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHelp(!showHelp)}
            className="gap-2"
            title="Show timeline help"
          >
            <Info className="h-4 w-4" />
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
