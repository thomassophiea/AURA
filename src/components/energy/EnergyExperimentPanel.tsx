import { useMemo, useState } from 'react';
import { Leaf, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/MetricCard';
import { cn } from '@/components/ui/utils';
import { useEnergyExperiment, type ExperimentRange } from '@/hooks/useEnergyExperiment';
import type { ExperimentSavings, SavingsProvenance } from '@/types/energyExperiment';
import { ExperimentComparisonChart } from './ExperimentComparisonChart';
import { ExperimentTimeline } from './ExperimentTimeline';
import { ExperimentApTable } from './ExperimentApTable';
import { EnergyPocControlPanel } from './EnergyPocControlPanel';

const RANGES: Array<{ key: ExperimentRange; label: string }> = [
  { key: 'live', label: 'Live' },
  { key: '24h', label: '24H' },
  { key: '3d', label: '3D' },
  { key: '7d', label: '7D' },
  { key: 'poc', label: 'POC' },
];

const STATE_LABEL: Record<string, string> = {
  ready: 'Ready',
  collecting_baseline: 'Collecting baseline',
  baseline_established: 'Baseline established',
  darkness_detected: 'Darkness detected',
  optimization_active: 'Energy optimization active',
  recovering: 'Recovering',
  complete: 'Complete',
  error: 'Needs attention',
};

/** How a number should be labelled, given how it was obtained. */
const PROVENANCE_LABEL: Record<SavingsProvenance, string> = {
  measured: 'Measured',
  'measured-telemetry-simulated-trigger': 'Measured (simulated trigger)',
  simulated: 'Simulated — no controller change was made',
};

function w(value: number | null | undefined, digits = 2): string {
  return value == null ? '—' : `${value.toFixed(digits)} W`;
}

function pct(value: number | null | undefined): string {
  return value == null ? '—' : `${value.toFixed(1)}%`;
}

function money(symbol: string, value: number | null | undefined): string {
  return value == null ? '—' : `${symbol}${value.toFixed(2)}`;
}

/** The one sentence an executive reads. Nothing is claimed that is not supported. */
function headline(savings: ExperimentSavings | null | undefined, treatmentName: string): string {
  if (!savings) return `Baseline collecting. ${treatmentName} has not been optimized yet.`;
  if (!savings.claimSupported) {
    return 'Collecting — not enough measured data yet to state a difference.';
  }
  const p = savings.attributed.percent;
  if (p == null) return 'No defensible difference can be attributed yet.';
  if (p <= 0) return `${treatmentName} is not currently using less energy than the control site predicts.`;
  return `${treatmentName} is using ${p.toFixed(1)}% less energy than the control site predicts.`;
}

interface Props {
  /** Show the operator control panel. Hidden in the customer-facing view. */
  showControls?: boolean;
}

/**
 * The Treatment-vs-Control Energy POC.
 *
 * One story, top to bottom: what was saved, on which side, proven by what.
 * Complexity (per-AP detail, event timeline, readiness) lives behind
 * drill-downs so the first five seconds read clean.
 */
export function EnergyExperimentPanel({ showControls = false }: Props) {
  const { state, series, aps, trigger, readiness, range, setRange, loading, error, busy, run } =
    useEnergyExperiment(true);
  const [controlsOpen, setControlsOpen] = useState(showControls);
  const [detailOpen, setDetailOpen] = useState(false);

  const experiment = state?.experiment ?? null;
  const savings = state?.savings ?? null;
  const baseline = state?.baseline ?? null;
  const treatment = state?.treatment ?? null;
  const quality = state?.quality ?? null;
  const treatmentName = experiment?.treatment.siteName ?? 'Treatment';
  const controlName = experiment?.control.siteName ?? 'Control';
  const symbol = savings?.currency.symbol ?? '$';

  const simulatedResult = savings?.provenance === 'simulated';

  /**
   * Latest measured watts per AP for each side, straight off the series.
   *
   * "Current" should mean current, not "current during a treatment window" —
   * before an experiment reaches treatment the tiles would otherwise read as a
   * dash while the chart right below them is drawing live data.
   */
  const latest = useMemo(() => {
    const out: { treatment: number | null; control: number | null } = { treatment: null, control: null };
    if (!series) return out;
    for (const point of series.points) {
      if (point.wattsPerAp == null) continue;
      if (point.siteId === series.treatment.siteId) out.treatment = point.wattsPerAp;
      else if (point.siteId === series.control.siteId) out.control = point.wattsPerAp;
    }
    return out;
  }, [series]);

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {experiment ? `${treatmentName} vs ${controlName}` : 'Site energy experiment'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {experiment
                ? `${treatmentName} is energy optimized. ${controlName} is the control, deliberately unchanged.`
                : 'No experiment has been run yet.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {experiment ? (
              <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                {STATE_LABEL[experiment.state] ?? experiment.state}
              </span>
            ) : null}
            <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Time range">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setRange(r.key)}
                  aria-pressed={range === r.key}
                  className={cn(
                    'rounded px-2 py-1 text-xs font-medium transition-colors',
                    range === r.key
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Headline */}
        <div
          className={cn(
            'rounded-md border p-4',
            simulatedResult
              ? 'border-[color:var(--status-warning)]/40 bg-[color:var(--status-warning)]/10'
              : 'border-border bg-muted/30'
          )}
        >
          <p className="text-lg font-semibold text-foreground">{headline(savings, treatmentName)}</p>
          {savings ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {PROVENANCE_LABEL[savings.provenance]} · {savings.attributed.method} ·{' '}
              {baseline?.window.label ?? 'no baseline'}
              {quality ? ` · data quality: ${quality.rating}` : ''}
            </p>
          ) : null}
          {savings && !savings.attributed.usable ? (
            <p className="mt-1 text-xs text-[color:var(--status-warning)]">
              {savings.comparability.note}
            </p>
          ) : null}
        </div>

        {/* Two sides */}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2 rounded-md border border-[color:var(--status-success)]/40 p-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-[color:var(--status-success)]" aria-hidden />
              <h3 className="text-sm font-semibold text-foreground">{treatmentName}</h3>
              <span className="text-xs uppercase tracking-wide text-[color:var(--status-success)]">
                Energy optimized
              </span>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Current / AP</dt>
                <dd className="font-mono tabular-nums">
                  {w(treatment?.treatment.wattsPerAp ?? latest.treatment)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Baseline / AP</dt>
                <dd className="font-mono tabular-nums">{w(baseline?.treatment.wattsPerAp)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">APs optimized</dt>
                <dd className="font-mono tabular-nums">
                  {aps.filter((a) => a.energyState === 'optimized').length}/
                  {aps.filter((a) => a.side === 'treatment').length}
                </dd>
              </div>
            </dl>
          </div>

          <div className="space-y-2 rounded-md border border-border p-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">{controlName}</h3>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Control</span>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Current / AP</dt>
                <dd className="font-mono tabular-nums">
                  {w(treatment?.control.wattsPerAp ?? latest.control)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Baseline / AP</dt>
                <dd className="font-mono tabular-nums">{w(baseline?.control.wattsPerAp)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">APs normal</dt>
                <dd className="font-mono tabular-nums">{aps.filter((a) => a.side === 'control').length}</dd>
              </div>
            </dl>
          </div>
        </div>

        <ExperimentComparisonChart series={series} loading={loading} />

        {/* Savings tiles */}
        {savings?.projected ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Saved so far"
              value={
                savings.projected.observedWh == null
                  ? '—'
                  : `${savings.projected.observedWh.toFixed(1)} Wh`
              }
              subtitle={`over ${(savings.elapsedSeconds / 60).toFixed(0)} min`}
              tone="healthy"
            />
            <MetricCard
              title="Reduction"
              value={pct(savings.attributed.percent)}
              subtitle={`${w(savings.attributed.siteWatts)} across ${treatmentName}`}
              tone="healthy"
              toneValue
            />
            <MetricCard
              title="Projected annual"
              value={
                savings.projected.annualKwh == null
                  ? '—'
                  : `${savings.projected.annualKwh.toFixed(0)} kWh`
              }
              subtitle={`${money(symbol, savings.projected.annualCost)} at ${symbol}${savings.currency.ratePerKwh}/kWh`}
            />
            <MetricCard
              title="Projected CO₂e"
              value={
                savings.projected.annualCo2eKg == null
                  ? '—'
                  : `${savings.projected.annualCo2eKg.toFixed(1)} kg/yr`
              }
              subtitle={savings.emissionsFactorSource}
              icon={Leaf}
              tone="healthy"
            />
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => setDetailOpen((v) => !v)}>
            {detailOpen ? 'Hide' : 'Show'} detail
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setControlsOpen((v) => !v)}>
            {controlsOpen ? 'Hide' : 'Show'} POC controls
          </Button>
        </div>
      </Card>

      {detailOpen ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold text-foreground">Access points</h3>
            <ExperimentApTable aps={aps} />
          </Card>
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold text-foreground">Timeline</h3>
            <ExperimentTimeline events={state?.events ?? []} />
          </Card>
        </div>
      ) : null}

      {controlsOpen ? (
        <EnergyPocControlPanel
          state={state}
          readiness={readiness}
          trigger={trigger}
          busy={busy}
          run={run}
          error={error}
        />
      ) : null}
    </div>
  );
}
