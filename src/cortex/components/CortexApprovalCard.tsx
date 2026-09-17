import { Button } from '@/components/ui/button';

interface ModifyDiff {
  path: string;
  label: string;
  from: unknown;
  to: unknown;
  risk: string;
  rationale?: string;
  postCondition: string;
}

interface ApprovalEvent {
  emit: string;
  validationToken?: string;
  /** workflowId lives on the preview, matching the wire shape. */
  preview?: { workflowId?: string; intent?: string; diff?: ModifyDiff | null } | null;
}

interface Props {
  event: ApprovalEvent;
  onApprove: (workflowId: string, token: string) => void;
  onDecline: (workflowId: string) => void;
  /** A decision has already been taken on this card. */
  decided?: boolean;
}

const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));

/**
 * The approval surface for a configuration change.
 *
 * It renders the diff rather than a summary because consent has to be to
 * something specific: approving "enable 802.11k" is approving a sentence, while
 * approving `enabled11kSupport: false → true` is approving a change. The
 * post-condition is shown before the operator decides, so what would count as
 * failure is known in advance rather than explained afterwards.
 *
 * The validation token travels with the click, which is what binds consent to
 * the plan that was actually previewed — a plan that changed in between is a
 * different plan, and the server refuses it.
 *
 * Deliberately NOT built on `ApprovalControls`: that component is bound to WLAN
 * creation (wlanName/siteName, "Confirm and Configure", voice confirm, Edit),
 * and bending its contract to fit a field change would have meant passing
 * no-op handlers and risking the panel that already depends on it.
 */
export function CortexApprovalCard({ event, onApprove, onDecline, decided = false }: Props) {
  const diff = event.preview?.diff;
  const workflowId = event.preview?.workflowId;
  if (event.emit !== 'preview' || !diff || !workflowId) return null;

  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium">{diff.label}</span>
        <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
          {diff.risk} risk
        </span>
      </div>

      {diff.rationale ? (
        <p className="text-xs text-muted-foreground">{diff.rationale}</p>
      ) : null}

      <div className="font-mono text-sm break-words">
        <span className="text-muted-foreground">{diff.path}</span>{' '}
        <span className="line-through opacity-70">{show(diff.from)}</span>
        <span aria-hidden="true">{' → '}</span>
        <span className="font-semibold">{show(diff.to)}</span>
      </div>

      <p className="text-xs text-muted-foreground">{diff.postCondition}</p>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={decided}
          onClick={() => onApprove(workflowId, event.validationToken ?? '')}
        >
          Apply this change
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={decided}
          onClick={() => onDecline(workflowId)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
