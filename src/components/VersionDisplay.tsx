import { useState } from 'react';
import { GitBranch, GitCommit, Calendar, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from './ui/utils';

interface VersionDisplayProps {
  className?: string;
  position?: 'bottom-left' | 'bottom-right';
  expandable?: boolean;
}

export function VersionDisplay({
  className,
  position = 'bottom-left',
  expandable = true
}: VersionDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Read from Vite environment variables (injected at build time)
  const version = import.meta.env.VITE_APP_VERSION || 'v0.0.0';
  const commitHash = import.meta.env.VITE_APP_COMMIT_HASH || 'unknown';
  const commitCount = import.meta.env.VITE_APP_COMMIT_COUNT || '0';
  const branch = import.meta.env.VITE_APP_BRANCH || 'unknown';
  const buildDate = import.meta.env.VITE_APP_BUILD_DATE
    ? new Date(import.meta.env.VITE_APP_BUILD_DATE).toLocaleString()
    : 'Unknown';

  const positionClasses = {
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4'
  };

  return (
    <div
      className={cn(
        "fixed z-50 transition-all duration-300",
        positionClasses[position],
        className
      )}
    >
      <div
        className={cn(
          "bg-sidebar/95 backdrop-blur-sm border border-sidebar-border rounded-lg shadow-lg",
          "text-sidebar-foreground text-xs",
          "transition-all duration-300",
          isExpanded ? "p-3 space-y-2 min-w-[240px]" : "px-3 py-1.5"
        )}
      >
        {/* Compact View */}
        <div
          className={cn(
            "flex items-center gap-2 cursor-pointer select-none",
            expandable && "hover:text-sidebar-accent-foreground"
          )}
          onClick={() => expandable && setIsExpanded(!isExpanded)}
        >
          <GitBranch className="h-3 w-3 text-muted-foreground" />
          <span className="font-mono font-medium">{version}</span>
          {expandable && (
            isExpanded ?
              <ChevronDown className="h-3 w-3 ml-auto text-muted-foreground" /> :
              <ChevronUp className="h-3 w-3 ml-auto text-muted-foreground" />
          )}
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
              <span className="text-[10px]">{buildDate}</span>
            </div>
            <div className="text-[10px] text-muted-foreground/70 pt-1">
              Build #{commitCount}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
