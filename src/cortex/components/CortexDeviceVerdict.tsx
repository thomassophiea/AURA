/**
 * The two device-health verdicts, shown as verdicts rather than as prose.
 *
 * WHY THIS EXISTS
 * ---------------
 * The same argument as `CortexReadings`, applied to a conclusion instead of a
 * measurement. A device-health answer is read by someone deciding whether to
 * send an engineer to a site or raise a hardware case, and the two facts that
 * decision turns on — is the AP healthy, and should it be replaced — were
 * sentences inside a paragraph. Worse, "RMA: No RMA Indicated" is the single
 * most skippable line in a wall of text, and it is the one that stops an AP
 * being swapped for no reason.
 *
 * Rendered from the LEDGER DIGEST, never from parsing the answer. The runtime
 * computed both verdicts; the UI shows what the runtime computed. A fluent
 * paragraph cannot talk this tile out of saying Unknown.
 *
 * UNKNOWN IS STYLED AS ITS OWN THING, not as a muted Healthy. The whole feature
 * exists because "we could not assess three of these" was being read as "they
 * are fine", and a grey tile next to four green ones would reproduce that in
 * pixels.
 */
import React from 'react';
import { cn } from '@/components/ui/utils';

export interface CortexDeviceVerdictData {
  /** Healthy | Degraded | Unhealthy | Unknown — for a single AP. */
  health?: string | null;
  /** No RMA Indicated | RMA Candidate | RMA Recommended. */
  rma?: string | null;
  /** Fleet counts, when the assessment covered more than one AP. */
  fleet?: {
    apCount: number | null;
    healthy: number;
    degraded: number;
    unhealthy: number;
    unknown: number;
    rmaCandidates: number;
    rmaRecommended: number;
  } | null;
}

const HEALTH_STYLE: Record<string, string> = {
  Healthy: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  Degraded: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  Unhealthy: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
  // Deliberately distinct from every other state: not a soft pass, not a fault.
  Unknown: 'border-slate-400/40 bg-slate-400/10 text-slate-200',
};

const RMA_STYLE: Record<string, string> = {
  'No RMA Indicated': 'border-white/10 bg-white/5 text-white/70',
  'RMA Candidate': 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  'RMA Recommended': 'border-rose-400/40 bg-rose-400/15 text-rose-100',
};

const Tile: React.FC<{ label: string; value: string; className?: string; hint?: string }> = ({
  label, value, className, hint,
}) => (
  <div className={cn('rounded-md border px-2.5 py-1.5', className ?? HEALTH_STYLE.Unknown)}>
    <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
    <div className="text-sm font-medium leading-tight">{value}</div>
    {hint ? <div className="text-[10px] opacity-70 mt-0.5">{hint}</div> : null}
  </div>
);

export const CortexDeviceVerdict: React.FC<{ verdict: CortexDeviceVerdictData }> = ({ verdict }) => {
  const { health, rma, fleet } = verdict;

  if (fleet) {
    const counts: Array<[string, number, string]> = [
      ['Healthy', fleet.healthy, HEALTH_STYLE.Healthy],
      ['Degraded', fleet.degraded, HEALTH_STYLE.Degraded],
      ['Unhealthy', fleet.unhealthy, HEALTH_STYLE.Unhealthy],
      ['Unknown', fleet.unknown, HEALTH_STYLE.Unknown],
    ];
    const rmaTotal = fleet.rmaCandidates + fleet.rmaRecommended;
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          {counts.map(([label, n, style]) => (
            <Tile key={label} label={label} value={String(n)} className={style} />
          ))}
          <Tile
            label="RMA"
            value={rmaTotal === 0 ? 'None' : String(rmaTotal)}
            className={rmaTotal === 0 ? RMA_STYLE['No RMA Indicated'] : RMA_STYLE['RMA Candidate']}
            hint={rmaTotal === 0
              ? 'no candidates'
              : `${fleet.rmaCandidates} candidate, ${fleet.rmaRecommended} recommended`}
          />
        </div>
        {fleet.unknown > 0 && (
          // Said in words as well as in a tile. A number in a grey box is easy
          // to read as "nothing to see"; this is the opposite of that.
          <p className="text-[11px] text-slate-300/80">
            {fleet.unknown} of {fleet.apCount ?? '?'} could not be assessed — that is not a clean
            bill of health for them.
          </p>
        )}
      </div>
    );
  }

  if (!health && !rma) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {health ? (
        <Tile
          label="Health"
          value={health}
          className={HEALTH_STYLE[health] ?? HEALTH_STYLE.Unknown}
          hint={health === 'Unknown' ? 'a required reading was missing' : undefined}
        />
      ) : null}
      {rma ? (
        <Tile
          label="RMA"
          value={rma.replace(/^RMA /, '')}
          className={RMA_STYLE[rma] ?? RMA_STYLE['No RMA Indicated']}
          // Cortex assesses. It never claims an RMA has been granted, and the
          // tile must not imply one either.
          hint={rma === 'RMA Recommended' ? 'assessment only — not a raised case' : undefined}
        />
      ) : null}
    </div>
  );
};
