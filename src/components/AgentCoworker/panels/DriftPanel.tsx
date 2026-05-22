import { AlertTriangle, RefreshCw, Trash2, Loader2, ShieldCheck } from 'lucide-react';
import { cn } from '../../ui/utils';

export interface DriftAlert {
  id: string;
  type: string;
  detail: string;
  detectedAt: string;
}

interface DriftPanelProps {
  alerts: DriftAlert[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onClear: () => void;
  onRevalidate?: () => void;
}

export function DriftPanel({
  alerts,
  loading,
  error,
  onRefresh,
  onClear,
  onRevalidate,
}: DriftPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60 shrink-0">
        <span className="text-xs font-medium text-muted-foreground">
          {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-1">
          {onRevalidate && alerts.length > 0 && (
            <button
              onClick={onRevalidate}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-primary hover:bg-primary/10 transition-colors"
              title="Switch to Validate panel"
            >
              <ShieldCheck className="h-3 w-3" />
              Validate
            </button>
          )}
          <button
            onClick={onRefresh}
            className="p-1 rounded hover:bg-accent/30 text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClear}
            disabled={alerts.length === 0}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
              'text-red-400 hover:bg-red-900/20 disabled:opacity-40 disabled:cursor-not-allowed'
            )}
            aria-label="Clear"
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        )}

        {!loading && error && (
          <div className="flex items-center justify-center h-full text-sm text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && alerts.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="h-6 w-6 opacity-30" />
            No drift detected
          </div>
        )}

        {!loading && alerts.length > 0 && (
          <div className="divide-y divide-border/40">
            {alerts.map((alert) => (
              <div key={alert.id} className="px-4 py-3 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span className="text-xs font-mono text-amber-300 bg-amber-900/30 px-1.5 py-0.5 rounded">
                    {alert.type}
                  </span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {new Date(alert.detectedAt).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-xs text-foreground/70 pl-5">{alert.detail}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
