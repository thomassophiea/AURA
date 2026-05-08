import { useCallback, useEffect, useState } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { globalElementsService } from '../../services/globalElementsService';
import { driftDetectionService } from '../../services/driftDetectionService';
import { Button } from '../ui/button';
import { RelativeTime } from '../ui/RelativeTime';
import { AlertTriangle, CheckCircle, RefreshCw, ShieldCheck, ShieldAlert } from 'lucide-react';
import { cn } from '../ui/utils';
import type { DriftSummary } from '../../types/deployment';

type Status = 'idle' | 'loading' | 'ready' | 'error' | 'unavailable';

/**
 * DriftStrip — surfaces the driftDetectionService result above the KPI grid.
 *
 * Wave 4A. Self-loads templates / definitions / values / assignments via
 * globalElementsService + tenantService (consumed via AppContext) so the
 * dashboard parent doesn't have to thread that state through. If the org
 * has no templates configured, the strip renders an "unavailable" hint
 * instead of a misleading "in-sync" zero.
 */
export function DriftStrip() {
  const { organization, siteGroups } = useAppContext();
  const [status, setStatus] = useState<Status>('idle');
  const [summary, setSummary] = useState<DriftSummary | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const runCheck = useCallback(async () => {
    if (!organization?.id) {
      setStatus('unavailable');
      return;
    }
    setStatus('loading');
    setErrorMessage(null);
    try {
      const orgId = organization.id;
      const [templates, definitions, values, assignments] = await Promise.all([
        globalElementsService.getTemplates(orgId),
        globalElementsService.getVariableDefinitions(orgId),
        globalElementsService.getVariableValues(orgId),
        globalElementsService.getAssignmentsByOrg(orgId),
      ]);

      if (templates.length === 0) {
        setStatus('unavailable');
        setSummary(null);
        return;
      }

      const result = await driftDetectionService.checkAll(
        templates,
        definitions,
        values,
        assignments,
        siteGroups
      );
      setSummary(result);
      setLastCheckedAt(Date.now());
      setStatus('ready');
    } catch (err) {
      console.error('[DriftStrip] Drift check failed:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Drift check failed');
      setStatus('error');
    }
  }, [organization?.id, siteGroups]);

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  // ----- Render branches -----

  if (status === 'unavailable') {
    return null; // No templates configured → no point showing a strip.
  }

  if (status === 'idle' || (status === 'loading' && !summary)) {
    return (
      <div
        className={cn(
          'flex items-center gap-3 rounded-sm border border-[color:var(--aura-amber-hairline)]',
          'bg-[color:var(--aura-panel)]/40 px-4 py-2.5',
          'font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground'
        )}
        role="status"
        aria-live="polite"
      >
        <RefreshCw className="h-3.5 w-3.5 animate-spin text-[color:var(--aura-amber)]" />
        <span>Drift check running…</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        className={cn(
          'flex items-center gap-3 rounded-sm border border-[color:var(--status-warning)]/40',
          'bg-[color:var(--status-warning-bg)]/40 px-4 py-2.5',
          'font-mono text-xs text-muted-foreground'
        )}
        role="alert"
      >
        <AlertTriangle className="h-3.5 w-3.5 text-[color:var(--status-warning)]" />
        <span className="uppercase tracking-[0.16em]">Drift check unavailable: {errorMessage}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => runCheck()}
          className="ml-auto h-7 px-2 font-mono text-[10px] uppercase tracking-[0.16em]"
        >
          <RefreshCw className="mr-1 h-3 w-3" />
          Retry
        </Button>
      </div>
    );
  }

  if (!summary) return null;

  const drifted = summary.drifted + summary.missing + summary.errors;
  const allGood = drifted === 0;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-sm border px-4 py-2.5',
        'font-mono text-xs uppercase tracking-[0.16em]',
        allGood
          ? 'border-[color:var(--status-success)]/30 bg-[color:var(--status-success-bg)]/30 text-muted-foreground'
          : 'border-[color:var(--status-warning)]/40 bg-[color:var(--status-warning-bg)]/30 text-muted-foreground'
      )}
      role="status"
      aria-live="polite"
    >
      {allGood ? (
        <>
          <ShieldCheck className="h-4 w-4 text-[color:var(--status-success)]" />
          <span className="text-[color:var(--status-success)]">CONFIG IN SYNC</span>
          <span className="opacity-60">
            {summary.in_sync} template{summary.in_sync === 1 ? '' : 's'} verified
          </span>
        </>
      ) : (
        <>
          <ShieldAlert className="h-4 w-4 text-[color:var(--status-warning)]" />
          <span className="text-[color:var(--status-warning)]">
            DRIFT DETECTED — {drifted} item{drifted === 1 ? '' : 's'}
          </span>
          <span className="opacity-60">
            {summary.drifted > 0 && (
              <>
                <span className="mr-2">{summary.drifted} drifted</span>
              </>
            )}
            {summary.missing > 0 && <span className="mr-2">{summary.missing} missing</span>}
            {summary.errors > 0 && <span>{summary.errors} errors</span>}
          </span>
        </>
      )}

      <span className="ml-auto flex items-center gap-2 normal-case tracking-normal text-[11px]">
        {lastCheckedAt && (
          <span className="opacity-60">
            checked <RelativeTime date={lastCheckedAt} />
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => runCheck()}
          disabled={status === 'loading'}
          className="h-7 px-2 font-mono text-[10px] uppercase tracking-[0.16em]"
          title="Re-run drift check"
        >
          <RefreshCw className={cn('mr-1 h-3 w-3', status === 'loading' && 'animate-spin')} />
          Recheck
        </Button>
      </span>

      {/* Compact icon legend when in sync state for visual balance */}
      {allGood && <CheckCircle className="hidden" aria-hidden="true" />}
    </div>
  );
}
