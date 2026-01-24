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
            {/* Status indicator - click to unlock if locked */}
            {isLocked ? (
              <Button
                variant="default"
                size="sm"
                onClick={onToggleLock}
                className="gap-2 bg-violet-600 hover:bg-violet-700 text-white shadow-md font-semibold"
                title="Click to unlock (or click on any chart)"
              >
                <Lock className="h-4 w-4" />
                Locked
              </Button>
            ) : (
              <Badge variant="secondary" className="gap-1.5 px-2 py-1.5 flex items-center">
                <Unlock className="h-3.5 w-3.5" />
                <span className="font-medium">{currentTime === null ? 'Unlocked' : 'Tracking'}</span>
              </Badge>
            )}

            {hasTimeWindow && (
              <Badge variant="outline" className="text-xs px-2 py-1">
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
          <div className="text-xs text-muted-foreground font-medium">
            {isLocked && '🔒 Locked - Click chart or button to unlock'}
            {!isLocked && currentTime === null && '💡 Hover chart to preview time'}
            {!isLocked && currentTime !== null && '👆 Click chart to lock at this time'}
          </div>
        </div>
      </div>

      {showHelp && (
        <div className="px-4 py-3 bg-blue-500/5 border-t border-blue-500/20">
          <div className="text-sm space-y-2">
            <div className="font-semibold text-blue-600 dark:text-blue-400">⏱️ Timeline Navigation Guide</div>
            <ul className="space-y-1.5 text-xs text-muted-foreground ml-4">
              <li><strong>Hover:</strong> Move mouse over any chart to preview time - reference line appears across all charts</li>
              <li><strong>🎯 Click to Lock:</strong> Click directly on any chart to lock the timeline at that exact moment (click again to unlock)</li>
              <li><strong>Time Range Selection:</strong> Hold <kbd className="px-1.5 py-0.5 bg-muted border rounded text-xs font-mono">Shift</kbd> + drag across chart to highlight a time window</li>
              <li><strong>Copy Timeline:</strong> Lock a time, then click "Copy to..." to sync this exact moment to the other insights page</li>
              <li><strong>Correlation Workflow:</strong> See a spike in Client Insights → Click to lock → Copy to AP Insights → See what AP was doing at same time!</li>
              <li><strong>Clear Selection:</strong> Click "Clear Selection" button to remove time window highlights</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
