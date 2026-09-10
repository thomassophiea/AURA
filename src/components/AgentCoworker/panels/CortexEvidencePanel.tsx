import { useState } from 'react';
import { ChevronDown, ChevronUp, ShieldAlert, AlertTriangle, Check } from 'lucide-react';
import { cn } from '../../ui/utils';
import type { CortexEvidence } from '@/services/cortexApiClient';

/**
 * The evidence behind a Cortex answer, collapsed by default.
 *
 * Why this exists: a diagnosis the operator cannot check is a diagnosis they
 * have to trust, and trust is the wrong basis for a network change. This panel
 * shows exactly what was retrieved, how long it took, and — importantly — the
 * agent's own audit of whether its answer is supported by that evidence.
 *
 * Collapsed by default because raw retrieval detail is noise until questioned.
 * Anything alarming (an unsupported claim, instruction-like text in network
 * data, a truncated investigation) is surfaced on the collapsed row so it
 * cannot be missed by not expanding.
 */
export function CortexEvidencePanel({
  evidence,
  activity,
}: {
  evidence: CortexEvidence;
  activity?: string[];
}) {
  const [open, setOpen] = useState(false);

  const succeeded = evidence.ledger.filter((l) => l.ok).length;
  const failed = evidence.ledger.length - succeeded;
  const suspicious = evidence.ledger.reduce((n, l) => n + (l.suspiciousFields ?? 0), 0);
  const unsupported = evidence.audit?.length ?? 0;
  const truncated =
    evidence.stoppedBecause !== 'completed' && evidence.stoppedBecause !== 'provider_error';

  // Anything the operator must see even if they never expand the panel.
  const alarms = [
    unsupported > 0 && {
      tone: 'danger' as const,
      icon: ShieldAlert,
      text: `${unsupported} claim${unsupported > 1 ? 's' : ''} not backed by the evidence`,
    },
    suspicious > 0 && {
      tone: 'warn' as const,
      icon: ShieldAlert,
      text: `${suspicious} field${suspicious > 1 ? 's' : ''} contained instruction-like text (ignored)`,
    },
    failed > 0 && {
      tone: 'warn' as const,
      icon: AlertTriangle,
      text: `${failed} retrieval${failed > 1 ? 's' : ''} failed — the answer may be incomplete`,
    },
    truncated && {
      tone: 'warn' as const,
      icon: AlertTriangle,
      text: `investigation stopped early (${evidence.stoppedBecause.replace(/_/g, ' ')})`,
    },
  ].filter(Boolean) as Array<{ tone: 'danger' | 'warn'; icon: typeof ShieldAlert; text: string }>;

  return (
    <div className="mt-1.5 rounded-lg border border-white/8 bg-white/[0.02]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
        aria-expanded={open}
      >
        {open ? (
          <ChevronUp className="h-3 w-3 shrink-0 text-white/35" />
        ) : (
          <ChevronDown className="h-3 w-3 shrink-0 text-white/35" />
        )}
        <span className="text-[11px] text-white/45">
          {succeeded} source{succeeded === 1 ? '' : 's'} checked
        </span>
        {alarms.length === 0 && (
          <span className="flex items-center gap-1 text-[11px] text-green-400/70">
            <Check className="h-3 w-3" />
            evidence-backed
          </span>
        )}
        <span className="ml-auto shrink-0 font-mono text-[10px] text-white/25">
          {evidence.model}
        </span>
      </button>

      {alarms.length > 0 && (
        <div className="flex flex-col gap-1 px-2.5 pb-1.5">
          {alarms.map((a, i) => (
            <span
              key={i}
              className={cn(
                'flex items-start gap-1.5 text-[11px]',
                a.tone === 'danger' ? 'text-red-400' : 'text-amber-400/90'
              )}
            >
              <a.icon className="mt-[1px] h-3 w-3 shrink-0" />
              {a.text}
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="space-y-2.5 border-t border-white/8 px-2.5 py-2">
          {activity && activity.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-white/30">
                What Cortex did
              </p>
              <ol className="space-y-0.5">
                {activity.map((step, i) => (
                  <li key={i} className="flex gap-1.5 text-[11px] text-white/55">
                    <span className="text-white/25">{i + 1}.</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-white/30">
              Sources
            </p>
            <div className="space-y-0.5">
              {evidence.ledger.map((l, i) => (
                <div key={i} className="flex items-baseline gap-2 font-mono text-[10.5px]">
                  <span className={l.ok ? 'text-green-400/70' : 'text-red-400/80'}>
                    {l.ok ? 'ok' : 'fail'}
                  </span>
                  <span className="text-white/60">{l.tool}</span>
                  {l.basis && <span className="text-white/30">{l.basis}</span>}
                  <span className="ml-auto text-white/25">
                    {l.durationMs != null ? `${(l.durationMs / 1000).toFixed(1)}s` : ''}
                  </span>
                </div>
              ))}
              {evidence.ledger.length === 0 && (
                <p className="text-[11px] text-white/40">
                  No sources were read — this answer is not evidence-backed.
                </p>
              )}
            </div>
          </div>

          {evidence.audit?.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-red-400/70">
                Unsupported claims
              </p>
              {evidence.audit.map((f, i) => (
                <p key={i} className="text-[11px] text-red-400/85">
                  {f.detail}
                </p>
              ))}
            </div>
          )}

          {evidence.warnings?.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-amber-400/70">
                Warnings
              </p>
              {evidence.warnings.map((w, i) => (
                <p key={i} className="text-[11px] text-amber-400/80">
                  {w}
                </p>
              ))}
            </div>
          )}

          <p className="border-t border-white/5 pt-1.5 text-[10px] text-white/30">
            {evidence.toolCalls} tool call{evidence.toolCalls === 1 ? '' : 's'} over{' '}
            {evidence.iterations} step{evidence.iterations === 1 ? '' : 's'}
            {evidence.capabilityGaps > 0 && (
              <>
                {' · '}
                {evidence.capabilityGaps} thing{evidence.capabilityGaps === 1 ? '' : 's'} this
                Gateway cannot report
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
