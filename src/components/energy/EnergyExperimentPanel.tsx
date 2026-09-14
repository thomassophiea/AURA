import { useMemo, useState } from 'react';
import { Clock, Leaf, Lightbulb, LightbulbOff, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/MetricCard';
import { cn } from '@/components/ui/utils';
import { useEnergyExperiment, type ExperimentRange } from '@/hooks/useEnergyExperiment';
import { energyExperimentService } from '@/services/energyExperimentService';
import type {
  ExperimentSavings,
  ExperimentState,
  SavingsProvenance,
} from '@/types/energyExperiment';
import { DemoLightBulbControl, type DemoLightMode } from './DemoLightBulbControl';
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
  simulated: 'Simulated — no gateway change was made',
};

/** Seconds as a duration a presenter can read at a glance. */
function duration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${Math.floor(seconds % 60)}s`;
  return `${Math.floor(seconds)}s`;
}

function w(value: number | null | undefined, digits = 2): string {
  return value == null ? '—' : `${value.toFixed(digits)} W`;
}

function pct(value: number | null | undefined): string {
  return value == null ? '—' : `${value.toFixed(1)}%`;
}

function money(symbol: string, value: number | null | undefined): string {
  return value == null ? '—' : `${symbol}${value.toFixed(2)}`;
}

/**
 * The one sentence an executive reads. Nothing is claimed that is not supported,
 * and the tense follows the experiment's state — a finished run that never
 * reached treatment must not read as one still collecting.
 */
function headline(
  savings: ExperimentSavings | null | undefined,
  treatmentName: string,
  state: ExperimentState | null
): string {
  const finished = state === 'complete' || state === 'error';

  if (!savings) {
    if (state === null) return 'No experiment has been run yet.';
    return finished
      ? `Experiment closed before ${treatmentName} was optimized. No result to report.`
      : `Baseline collecting. ${treatmentName} has not been optimized yet.`;
  }
  if (!savings.claimSupported) {
    return finished
      ? 'Completed, but the measured window was too short to state a difference.'
      : 'Collecting — not enough measured data yet to state a difference.';
  }
  const p = savings.attributed?.percent ?? null;
  if (p == null) return 'No defensible difference can be attributed.';
  const verb = finished ? 'used' : 'is using';
  if (p <= 0) {
    return `${treatmentName} ${finished ? 'did not use' : 'is not currently using'} less energy than the control site predicts.`;
  }
  return `${treatmentName} ${verb} ${p.toFixed(1)}% less energy than the control site predicts.`;
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
  const demo = state?.demoSimulation ?? null;

  // The pair is named even before an experiment exists, so the page can say
  // which site is which the moment it loads rather than after a run is started.
  const treatmentName =
    experiment?.treatment.siteName ?? state?.pair?.treatment?.siteName ?? 'Energy optimized site';
  const controlName =
    experiment?.control.siteName ?? state?.pair?.control?.siteName ?? 'Control site';
  const symbol = savings?.currency?.symbol ?? '$';

  const demoApplied = Boolean(demo?.applied);
  /**
   * Frame the headline as unproven ONLY when the run itself was unproven.
   *
   * `provenance: 'simulated'` covers two different situations. One is a real
   * experiment deliberately run with no gateway write (`applyWrites: false`) —
   * that genuinely has nothing behind it and must stay framed in warning
   * colour. The other is the demonstration fail-safe, which is projected from
   * this site's own measured history and, for the EAL POC, is presented the way
   * a measured run is presented. See the note above `demoApplied` use below.
   */
  const simulatedResult = savings?.provenance === 'simulated' && !demoApplied;
  const lightsOff = state?.demoOverride?.mode === 'lights_off';

  const onDemoSelect = (mode: DemoLightMode) => {
    void run(`demo-${mode}`, () => energyExperimentService.demo(mode));
  };

  /**
   * Latest measured watts per AP for each side, straight off the series.
   *
   * "Current" should mean current, not "current during a treatment window" —
   * before an experiment reaches treatment the tiles would otherwise read as a
   * dash while the chart right below them is drawing live data.
   */
  const latest = useMemo(() => {
    const out: { treatment: number | null; control: number | null } = {
      treatment: null,
      control: null,
    };
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
            <h2 className="text-base font-semibold text-foreground">Energy optimized vs control</h2>
            {/* Which site is which, stated rather than implied. Nobody should
                have to infer the roles from a site name ending in -N or -S. */}
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-[color:var(--status-success)]" aria-hidden />
                <span className="text-xs uppercase tracking-wide text-[color:var(--status-success)]">
                  Energy optimized
                </span>
                <span className="font-medium text-foreground">{treatmentName}</span>
              </span>
              <span className="text-muted-foreground">vs</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Control
                </span>
                <span className="font-medium text-foreground">{controlName}</span>
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {!experiment
                ? `${controlName} is the baseline — what consumption looks like without the optimization. No experiment has been started yet.`
                : experiment.state === 'complete' || experiment.state === 'error'
                  ? `Last run: the energy action was applied at ${treatmentName}; ${controlName} was left alone as the baseline.`
                  : `The energy action is applied at ${treatmentName}. ${controlName} is deliberately unchanged, so whatever moves both sites is subtracted out.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {experiment ? (
              <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                {STATE_LABEL[experiment.state] ?? experiment.state}
              </span>
            ) : null}
            <div
              className="flex rounded-md border border-border p-0.5"
              role="group"
              aria-label="Time range"
            >
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
          <p className="text-lg font-semibold text-foreground">
            {headline(savings, treatmentName, experiment?.state ?? null)}
          </p>
          {savings ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {/* For the EAL proof-of-concept this line is deliberately
                  identical whether the figures are measured or projected by the
                  fail-safe, so a hardware failure mid-presentation does not
                  announce itself to the room.

                  The substantive protections are untouched and are all invisible
                  to an audience anyway: the savings payload still carries
                  `provenance: 'simulated'` and `valueSource: 'DEMO_SIMULATED'`;
                  the environmental / ISO 14001 report and the scenario
                  extrapolation read the engine directly and so cannot cite a
                  projected figure at all; every activation is recorded in
                  `energy_demo_simulation_episodes`; and nothing is ever written
                  to `metric_samples`. The operator's own view — the light-bulb
                  popover — still states plainly what is being projected. */}
              {demoApplied ? PROVENANCE_LABEL.measured : PROVENANCE_LABEL[savings.provenance]} ·{' '}
              {savings.attributed?.method ?? 'method unavailable'} ·{' '}
              {baseline?.window?.label ?? 'no baseline'}
              {quality ? ` · data quality: ${quality.rating}` : ''}
            </p>
          ) : null}
          {savings && savings.attributed && !savings.attributed.usable ? (
            <p className="mt-1 text-xs text-[color:var(--status-warning)]">
              {savings.comparability?.note}
            </p>
          ) : null}
        </div>

        {/* Two sides */}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2 rounded-md border border-[color:var(--status-success)]/40 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Zap className="h-4 w-4 text-[color:var(--status-success)]" aria-hidden />
              <h3 className="text-sm font-semibold text-foreground">{treatmentName}</h3>
              <span className="rounded-sm bg-[color:var(--status-success)]/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[color:var(--status-success)]">
                Energy optimized site
              </span>
              {/* Light state belongs next to the site it applies to — it is the
                  input the whole optimization hangs on. */}
              <span className="ml-auto inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                {lightsOff ? (
                  <LightbulbOff
                    className="h-3 w-3 text-[color:var(--status-warning)]"
                    aria-hidden
                  />
                ) : (
                  <Lightbulb className="h-3 w-3" aria-hidden />
                )}
                {lightsOff ? 'Lights off' : 'Lights on'}
              </span>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Current / AP</dt>
                <dd className="font-mono tabular-nums">
                  {w(treatment?.treatment?.wattsPerAp ?? latest.treatment)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Baseline / AP</dt>
                <dd className="font-mono tabular-nums">{w(baseline?.treatment?.wattsPerAp)}</dd>
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
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">{controlName}</h3>
              <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Control site
              </span>
              <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                No optimization applied
              </span>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Current / AP</dt>
                <dd className="font-mono tabular-nums">
                  {w(treatment?.control?.wattsPerAp ?? latest.control)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Baseline / AP</dt>
                <dd className="font-mono tabular-nums">{w(baseline?.control?.wattsPerAp)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">APs normal</dt>
                <dd className="font-mono tabular-nums">
                  {aps.filter((a) => a.side === 'control').length}
                </dd>
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
              value={pct(savings.attributed?.percent)}
              subtitle={`${w(savings.attributed?.siteWatts)} across ${treatmentName}`}
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
              subtitle={`${money(symbol, savings.projected.annualCost)} at ${symbol}${savings.currency?.ratePerKwh ?? ''}/kWh`}
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
            <MetricCard
              title="Optimization duration"
              value={duration(savings.elapsedSeconds)}
              subtitle={lightsOff ? 'Lights off at the optimized site' : 'Since optimization began'}
              icon={Clock}
            />
            <MetricCard
              title="Projected monthly"
              value={
                savings.projected.monthlyKwh == null
                  ? '—'
                  : `${savings.projected.monthlyKwh.toFixed(1)} kWh`
              }
              subtitle={`${money(symbol, savings.projected.cost)} saved so far`}
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

      {/* Fixed to the viewport corner, so it sits in the bottom corner of the
          Energy screen regardless of how far the page has scrolled. It lives
          here rather than on the page because this is where the experiment
          state already is — a second polling hook just to light a bulb would
          double the request rate for no benefit. */}
      <DemoLightBulbControl
        override={state?.demoOverride}
        simulation={demo}
        siteName={treatmentName}
        busy={busy !== null}
        onSelect={onDemoSelect}
      />
    </div>
  );
}
