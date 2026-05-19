import { useEffect, useState } from 'react';
import { GitBranch, GitCommit, Calendar, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from './ui/utils';

interface VersionInfo {
  version: string;
  commit: string;
  commitFull?: string;
  branch: string;
  buildDate: string;
  message?: string;
  features?: string[];
}

interface VersionDisplayProps {
  className?: string;
  position?: 'bottom-left' | 'bottom-right';
  expandable?: boolean;
}

// Build number is derived from the build date as YYYYMMDD — monotonic,
// recognizable as a date, and meaningful without needing the git commit
// count (which isn't available at runtime on Railway's stripped-.git build).
function buildNumberFromDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

export function VersionDisplay({
  className,
  position = 'bottom-left',
  expandable = true,
}: VersionDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [info, setInfo] = useState<VersionInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/version')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: VersionInfo | null) => {
        if (!cancelled && data) setInfo(data);
      })
      .catch(() => {
        /* leave info null — UI shows fallback "dev" */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const version = info?.version && info.version !== 'unknown' ? info.version : 'dev';
  const commitHash = info?.commit && info.commit !== 'unknown' ? info.commit : '—';
  const branch = info?.branch && info.branch !== 'unknown' ? info.branch : '—';
  const buildMessage = info?.message ?? '';
  const buildFeatures: string[] = info?.features ?? [];
  const buildDate = info?.buildDate ? new Date(info.buildDate).toLocaleString() : 'Unknown';
  const buildNumber = info?.buildDate ? buildNumberFromDate(info.buildDate) : '—';

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

        {isExpanded && expandable && (
          <div className="space-y-1.5 pt-1 border-t border-sidebar-border">
            <div className="flex items-center gap-2 text-muted-foreground">
              <GitCommit className="h-3 w-3 shrink-0" />
              <span className="font-mono">{commitHash}</span>
              <span className="text-muted-foreground/50 ml-auto">Build #{buildNumber}</span>
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
