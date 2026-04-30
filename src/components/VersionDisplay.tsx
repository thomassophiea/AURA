import { useState } from 'react';
import { GitBranch, GitCommit, Calendar, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from './ui/utils';
import { APP_VERSION } from '@/lib/versionGate';

interface VersionDisplayProps {
  className?: string;
  position?: 'bottom-left' | 'bottom-right';
  expandable?: boolean;
}

export function VersionDisplay({
  className,
  position = 'bottom-left',
  expandable = true,
}: VersionDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // APP_VERSION is injected at build time via __APP_VERSION__ define in vite.config.ts.
  // VITE_APP_* vars are not set by the build; fall back gracefully.
  const version = APP_VERSION !== '0.0.0' ? APP_VERSION : import.meta.env.DEV ? 'dev' : APP_VERSION;
  const commitHash = import.meta.env.VITE_APP_COMMIT_HASH || (import.meta.env.DEV ? 'local' : '—');
  const commitCount = import.meta.env.VITE_APP_COMMIT_COUNT || '—';
  const branch = import.meta.env.VITE_APP_BRANCH || (import.meta.env.DEV ? 'dev' : '—');
  const buildDate = import.meta.env.VITE_APP_BUILD_DATE
    ? new Date(import.meta.env.VITE_APP_BUILD_DATE).toLocaleString()
    : import.meta.env.DEV
      ? 'Local build'
      : 'Unknown';

  const positionClasses = {
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
  };

  return (
    <div
      className={cn('fixed z-50 transition-all duration-300', positionClasses[position], className)}
    >
      <div
        className={cn(
          'bg-sidebar/95 backdrop-blur-sm border border-sidebar-border rounded-lg shadow-lg',
          'text-sidebar-foreground text-xs',
          'transition-all duration-300',
          isExpanded ? 'p-3 space-y-2 min-w-[240px]' : 'px-3 py-1.5'
        )}
      >
        {/* Compact View */}
        <div
          className={cn(
            'flex items-center gap-2 cursor-pointer select-none',
            expandable && 'hover:text-sidebar-accent-foreground'
          )}
          onClick={() => expandable && setIsExpanded(!isExpanded)}
        >
          <GitBranch className="h-3 w-3 text-muted-foreground" />
          <span className="font-mono font-medium">{version}</span>
          {expandable &&
            (isExpanded ? (
              <ChevronDown className="h-3 w-3 ml-auto text-muted-foreground" />
            ) : (
              <ChevronUp className="h-3 w-3 ml-auto text-muted-foreground" />
            ))}
        </div>

        {/* Expanded View */}
        {isExpanded && expandable && (
          <div className="space-y-1.5 pt-1 border-t border-sidebar-border">
            <div className="flex items-center gap-2 text-muted-foreground">
              <GitCommit className="h-3 w-3" />
              <span className="font-mono">{commitHash}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <GitBranch className="h-3 w-3" />
              <span>{branch}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span className="text-xs">{buildDate}</span>
            </div>
            <div className="text-xs text-muted-foreground/70 pt-1">Build #{commitCount}</div>
          </div>
        )}
      </div>
    </div>
  );
}
