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

interface DeploymentTarget {
  profileName: string;
  action: 'bind' | 'fork' | 'none';
  forkName?: string | null;
  protectedSites?: string[];
  apNames?: string[];
  radios?: { index: number; band: string }[];
  excluded?: { index: number; band: string; reason: string }[];
}

interface DeploymentPlan {
  site: string;
  serviceName?: string | null;
  blastRadius?: { aps: number; profiles: number; forks: number; radios: number };
  targets?: DeploymentTarget[];
  warnings?: string[];
}

interface ApprovalEvent {
  emit: string;
  validationToken?: string;
  /** workflowId lives on the preview, matching the wire shape. */
  preview?: {
    workflowId?: string;
    intent?: string;
    diff?: ModifyDiff | null;
    deployment?: DeploymentPlan | null;
  } | null;
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
 * It renders what will happen rather than a summary, because consent has to be
 * to something specific. For a field change that means the diff; for a site
 * deployment it means the blast radius — every profile, every radio, and above
 * all which OTHER sites a fork is protecting. A deployment that quietly reached
 * a second building is the failure this view exists to make impossible, and it
 * cannot be caught by an operator reading the word "deploy".
 *
 * The validation token travels with the click, binding consent to the plan that
 * was previewed; a plan that changed in between is refused by the server.
 *
 * Deliberately NOT built on `ApprovalControls`: that component is bound to WLAN
 * creation (wlanName/siteName, "Confirm and Configure", voice confirm, Edit),
 * and bending its contract would have meant no-op handlers and risk to the
 * panel already using it.
 */
export function CortexApprovalCard({ event, onApprove, onDecline, decided = false }: Props) {
  const diff = event.preview?.diff;
  const deployment = event.preview?.deployment;
  const workflowId = event.preview?.workflowId;
  if (event.emit !== 'preview' || (!diff && !deployment) || !workflowId) return null;

  const actions = (label: string) => (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        disabled={decided}
        onClick={() => onApprove(workflowId, event.validationToken ?? '')}
      >
        {label}
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={decided} onClick={() => onDecline(workflowId)}>
        Cancel
      </Button>
    </div>
  );

  if (deployment) {
    const b = deployment.blastRadius;
    return (
      <div className="mt-2 rounded-lg border border-border bg-muted/30 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <span className="text-sm font-medium">
            Deploy {deployment.serviceName} to {deployment.site}
          </span>
          {b ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              {b.profiles} profile{b.profiles === 1 ? '' : 's'} · {b.radios} radio
              {b.radios === 1 ? '' : 's'} · {b.aps} AP{b.aps === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>

        <ul className="space-y-2 text-sm">
          {(deployment.targets ?? []).map((t) => (
            <li key={t.profileName} className="rounded border border-border/60 p-2 space-y-1">
              <div className="font-mono text-xs">
                <span className="uppercase tracking-wide text-muted-foreground">{t.action}</span>{' '}
                {t.profileName}
                {t.action === 'fork' && t.forkName ? (
                  <>
                    {' → '}
                    <span className="font-semibold">{t.forkName}</span>
                  </>
                ) : null}
              </div>

              <div className="text-xs text-muted-foreground">
                radios {(t.radios ?? []).map((r) => `${r.index} (${r.band} GHz)`).join(', ') || 'none'}
                {t.apNames?.length ? ` · ${t.apNames.length} AP` : ''}
              </div>

              {/* The reason a fork exists at all. Left implicit, a fork is
                  indistinguishable from an ordinary bind. */}
              {t.protectedSites?.length ? (
                <div className="text-xs">
                  Forked so this does <strong>not</strong> reach {t.protectedSites.join(', ')}.
                </div>
              ) : null}

              {(t.excluded ?? []).map((e) => (
                <div key={e.index} className="text-xs text-muted-foreground">
                  Radio {e.index} ({e.band} GHz) excluded — {e.reason}
                </div>
              ))}
            </li>
          ))}
        </ul>

        {(deployment.warnings ?? []).map((w) => (
          <p key={w} className="text-xs text-muted-foreground">
            {w}
          </p>
        ))}

        {actions('Deploy')}
      </div>
    );
  }

  const d = diff as ModifyDiff;
  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium">{d.label}</span>
        <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
          {d.risk} risk
        </span>
      </div>

      {d.rationale ? <p className="text-xs text-muted-foreground">{d.rationale}</p> : null}

      <div className="font-mono text-sm break-words">
        <span className="text-muted-foreground">{d.path}</span>{' '}
        <span className="line-through opacity-70">{show(d.from)}</span>
        <span aria-hidden="true">{' → '}</span>
        <span className="font-semibold">{show(d.to)}</span>
      </div>

      <p className="text-xs text-muted-foreground">{d.postCondition}</p>

      {actions('Apply this change')}
    </div>
  );
}
