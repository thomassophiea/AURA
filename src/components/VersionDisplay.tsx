import { useState } from 'react';
import { GitBranch, GitCommit, Calendar, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from './ui/utils';
import { APP_VERSION } from '@/lib/versionGate';

declare const __GIT_COMMIT__: string;
declare const __GIT_BRANCH__: string;
declare const __BUILD_DATE__: string;
declare const __COMMIT_COUNT__: string;
declare const __BUILD_MESSAGE__: string;
declare const __BUILD_FEATURES__: string[];

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

  const version = APP_VERSION !== '0.0.0' ? APP_VERSION : 'dev';
  const commitHash = (typeof __GIT_COMMIT__ !== 'undefined' && __GIT_COMMIT__) || '—';
  const commitCount = (typeof __COMMIT_COUNT__ !== 'undefined' && __COMMIT_COUNT__) || '—';
  const branch = (typeof __GIT_BRANCH__ !== 'undefined' && __GIT_BRANCH__) || '—';
  const buildMessage = (typeof __BUILD_MESSAGE__ !== 'undefined' && __BUILD_MESSAGE__) || '';
  const buildFeatures: string[] =
    (typeof __BUILD_FEATURES__ !== 'undefined' && __BUILD_FEATURES__) || [];
  const buildDate =
    typeof __BUILD_DATE__ !== 'undefined' && __BUILD_DATE__
      ? new Date(__BUILD_DATE__).toLocaleString()
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
              <GitCommit className="h-3 w-3 shrink-0" />
              <span className="font-mono">{commitHash}</span>
              <span className="text-muted-foreground/50 ml-auto">#{commitCount}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <GitBranch className="h-3 w-3 shrink-0" />
              <span>{branch}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-3 w-3 shrink-0" />
              <span className="text-xs">{buildDate}</span>
            </div>
            {buildMessage && (
              <div className="pt-1 border-t border-sidebar-border">
                <p className="text-xs font-medium text-sidebar-foreground truncate">
                  {buildMessage}
                </p>
              </div>
            )}
            {buildFeatures.length > 0 && (
              <div className="pt-1 border-t border-sidebar-border space-y-0.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">
                  Recent commits
                </p>
                {buildFeatures.map((f, i) => (
                  <p key={i} className="text-xs text-muted-foreground leading-tight truncate">
                    • {f}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
