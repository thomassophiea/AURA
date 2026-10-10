import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CortexApprovalCard } from './CortexApprovalCard';
import { fetchPendingCortexChanges, type PendingCortexChange } from '@/services/cortexApiClient';

interface Props {
  onApprove: (workflowId: string, token: string) => Promise<void> | void;
  onDecline: (workflowId: string) => Promise<void> | void;
  decided: string[];
}

/**
 * Changes drafted OUTSIDE this conversation — by an external agent over MCP —
 * waiting for a person.
 *
 * Such a draft has no transcript to appear in, so without this queue it would
 * sit unseen until it expired. Each card is the same approval surface the
 * conversation uses: the diff, what it reaches, and a token that binds the
 * click to exactly what is on screen.
 *
 * Loads on mount and on Refresh only. The panel holds still: a change request
 * appearing under the operator's cursor mid-read is how the wrong thing gets
 * approved.
 */
export function CortexPendingChanges({ onApprove, onDecline, decided }: Props) {
  const [items, setItems] = useState<PendingCortexChange[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const { pending } = await fetchPendingCortexChanges();
      setItems(pending);
      setError(null);
      setState('ready');
    } catch (err) {
      // 403 = not an operator; the queue is simply not theirs to act on.
      const msg = err instanceof Error ? err.message : String(err);
      setError(/ 403:/.test(msg) ? null : msg);
      setItems([]);
      setState(/ 403:/.test(msg) ? 'ready' : 'error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = items.filter((i) => !decided.includes(i.workflowId));
  if (state === 'ready' && open.length === 0) return null;

  return (
    <section aria-label="Pending changes" className="rounded-lg border border-border p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Pending changes{open.length ? ` · ${open.length}` : ''}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => void load()}
          aria-label="Refresh pending changes"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
      {state === 'error' && error ? (
        <p className="text-xs text-muted-foreground">Could not load pending changes: {error}</p>
      ) : null}
      {open.map((item) => (
        <div key={item.workflowId} className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Drafted by an external agent
            {item.createdAt ? ` · ${new Date(item.createdAt).toLocaleString()}` : ''}
            {item.blastRadius?.known
              ? ` · reaches ${item.blastRadius.accessPoints} AP${item.blastRadius.accessPoints === 1 ? '' : 's'} at ${
                  item.blastRadius.sites.join(', ') || 'no site'
                }`
              : ''}
          </p>
          <p className="text-sm">{item.intent}</p>
          <CortexApprovalCard
            event={{
              emit: 'preview',
              validationToken: item.validationToken,
              preview: item.preview,
            }}
            decided={decided.includes(item.workflowId)}
            onApprove={(id, token) => void onApprove(id, token)}
            onDecline={(id) => void onDecline(id)}
          />
        </div>
      ))}
    </section>
  );
}
