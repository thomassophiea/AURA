/**
 * Power Context Card
 *
 * Appears above the AP Insights charts when the timeline is locked. Answers
 * three questions about the locked instant, in descending order of certainty:
 * what power was measured, what else moved, and what config levers exist.
 *
 * Deliberately absent: a per-component watt breakdown. See powerAnalysis.ts for
 * why that number cannot be computed from this controller's telemetry.
 */

import { AlertTriangle, CheckCircle2, HelpCircle, Info, Leaf, TrendingUp } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import type { PowerContext, PowerLever, PowerVerdict, SeriesMovement } from '../../types/power';

interface PowerContextCardProps {
  context: PowerContext | null;
  levers: PowerLever[];
  /** True while the AP config read backing the levers is still in flight. */
  isLoadingLevers?: boolean;
}

/** Render a correlated series' value in its own reported unit. */
function formatSeriesValue(value: number, unit: string): string {
  switch (unit) {
    case 'bps':
      if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)} Gbps`;
      if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} Mbps`;
      if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)} Kbps`;
      return `${value.toFixed(0)} bps`;
    case '%':
      return `${value.toFixed(0)}%`;
    case 'dBm':
      return `${value.toFixed(1)} dBm`;
    case 'users':
      return value.toFixed(0);
    default:
      return value.toFixed(1);
  }
}

function formatDelta(delta: number, unit: string): string {
  const sign = delta > 0 ? '+' : '';
  return `${sign}${formatSeriesValue(delta, unit)}`;
}

function formatClockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

const VERDICT_STYLES: Record<
  PowerVerdict,
  { icon: typeof AlertTriangle; className: string; heading: string }
> = {
  explained: {
    icon: CheckCircle2,
    className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    heading: 'Explained',
  },
  unexplained: {
    icon: AlertTriangle,
    className: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
    heading: 'Unexplained',
  },
  nominal: {
    icon: CheckCircle2,
    className: 'border-border bg-muted/40 text-muted-foreground',
    heading: 'Nominal',
  },
  'insufficient-data': {
    icon: HelpCircle,
    className: 'border-border bg-muted/40 text-muted-foreground',
    heading: 'Not enough data',
  },
};

const CONFIG_LOCATIONS: Record<PowerLever['configTarget'], string> = {
  radio: 'Configure → Access Points → Radios',
  'ap-ports': 'Configure → Access Points → Ports',
  'ap-general': 'Configure → Access Points → Advanced',
};

function MovementRow({ movement }: { movement: SeriesMovement }) {
  const { label, value, unit, delta, zScore, correlation } = movement;
  const unusual = zScore !== null && Math.abs(zScore) >= 2;

  return (
    <div className="flex items-baseline justify-between gap-2 py-1 text-xs border-b border-border/40 last:border-0">
      <span className={unusual ? 'font-medium text-foreground' : 'text-muted-foreground'}>
        {label}
      </span>
      <span className="flex items-baseline gap-2 font-mono shrink-0">
        <span className="text-foreground">{formatSeriesValue(value, unit)}</span>
        <span
          className={
            unusual
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-muted-foreground/70'
          }
          title={
            correlation === null
              ? 'Flat across the window — no correlation computable'
              : `Correlation with power across the window: r=${correlation.toFixed(2)}`
          }
        >
          {formatDelta(delta, unit)}
        </span>
      </span>
    </div>
  );
}

function LeverRow({ lever }: { lever: PowerLever }) {
  return (
    <div className="py-1.5 border-b border-border/40 last:border-0">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-foreground">{lever.label}</span>
        <span className="font-mono shrink-0 text-muted-foreground">
          {lever.currentValue}
          <span className="mx-1 text-muted-foreground/50">→</span>
          <span className="text-foreground">{lever.proposedValue}</span>
        </span>
      </div>
      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{lever.tradeOff}</p>
      <p className="text-[11px] text-muted-foreground/60">{CONFIG_LOCATIONS[lever.configTarget]}</p>
    </div>
  );
}

export function PowerContextCard({ context, levers, isLoadingLevers }: PowerContextCardProps) {
  if (!context) return null;

  const { powerW, window, deltaW, deltaPercent, aboveFloorW, percentile, persistence } = context;
  const verdict = VERDICT_STYLES[context.verdict];
  const VerdictIcon = verdict.icon;

  const actionable = levers.filter((l) => !l.alreadyOptimal);
  const optimal = levers.filter((l) => l.alreadyOptimal);
  const elevated = deltaW > 0;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Leaf className="h-4 w-4 text-primary" />
            Power at {formatClockTime(context.timestamp)}
          </CardTitle>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-semibold tabular-nums">{powerW.toFixed(2)} W</span>
            <Badge variant="secondary" className="font-mono">
              {elevated ? '+' : ''}
              {deltaPercent.toFixed(0)}% vs {window.baselineW.toFixed(2)} W baseline
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div
          className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${verdict.className}`}
        >
          <VerdictIcon className="h-4 w-4 shrink-0 mt-px" />
          <p>
            <span className="font-semibold">{verdict.heading}.</span> {context.verdictDetail}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* What moved */}
          <section>
            <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              What moved
            </h4>
            {context.movements.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No other series reported data for this window.
              </p>
            ) : (
              <>
                <div>
                  {context.movements.slice(0, 6).map((movement) => (
                    <MovementRow key={movement.key} movement={movement} />
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground/60">
                  Change against each series&apos; own median for this window, ranked by how
                  unusual the move is. Hover a delta for its correlation with power.
                </p>
              </>
            )}
          </section>

          {/* Measured power */}
          <section>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Measured power
            </h4>
            <dl className="space-y-1 text-xs">
              {[
                ['At this point', `${powerW.toFixed(2)} W`],
                ['Window floor', `${window.floorW.toFixed(2)} W`],
                ['Window baseline', `${window.baselineW.toFixed(2)} W`],
                ['Window peak', `${window.peakW.toFixed(2)} W`],
                ['Above floor', `${aboveFloorW >= 0 ? '+' : ''}${aboveFloorW.toFixed(2)} W`],
                ['Rank in window', `${percentile.toFixed(0)}th percentile`],
                [
                  'Duration',
                  persistence === 'sustained'
                    ? `Sustained (${context.persistenceSamples} samples)`
                    : 'Transient (single sample)',
                ],
              ].map(([term, value]) => (
                <div
                  key={term}
                  className="flex items-baseline justify-between gap-2 border-b border-border/40 py-1 last:border-0"
                >
                  <dt className="text-muted-foreground">{term}</dt>
                  <dd className="font-mono text-foreground shrink-0">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-1.5 text-[11px] text-muted-foreground/60">
              All values measured, converted from the controller&apos;s milliwatts. Floor is this
              AP&apos;s lowest observed draw in the window, not a vendor rating.
            </p>
          </section>

          {/* Levers */}
          <section>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Power levers
            </h4>
            {isLoadingLevers ? (
              <p className="text-xs text-muted-foreground">Reading AP configuration…</p>
            ) : levers.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                AP configuration unavailable — levers cannot be determined.
              </p>
            ) : (
              <>
                {actionable.length > 0 ? (
                  <div>
                    {actionable.map((lever) => (
                      <LeverRow key={lever.id} lever={lever} />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Every lever is already at its lowest-power setting.
                  </p>
                )}

                {optimal.length > 0 && (
                  <p className="mt-2 text-[11px] leading-snug text-muted-foreground/70">
                    <span className="font-medium">Already optimal:</span>{' '}
                    {optimal.map((l) => `${l.label} (${l.currentValue})`).join(', ')}.
                  </p>
                )}

                <p className="mt-1.5 flex items-start gap-1 text-[11px] text-muted-foreground/60">
                  <Info className="h-3 w-3 shrink-0 mt-0.5" />
                  <span>
                    Savings are unverified — the controller reports no per-component power. After
                    changing a lever, compare this AP&apos;s window floor to confirm the effect.
                  </span>
                </p>
              </>
            )}
          </section>
        </div>
      </CardContent>
    </Card>
  );
}
