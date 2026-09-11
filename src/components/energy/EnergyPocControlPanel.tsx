import { useEffect, useState } from 'react';
import { AlertTriangle, Check, CircleAlert, Minus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/components/ui/utils';
import { energyExperimentService } from '@/services/energyExperimentService';
import type {
  DiscoveryResponse,
  ExperimentStateResponse,
  ReadinessCheck,
  ReadinessResponse,
  TriggerView,
} from '@/types/energyExperiment';

interface Props {
  state: ExperimentStateResponse | null;
  readiness: ReadinessResponse | null;
  trigger: TriggerView | null;
  busy: string | null;
  run: (label: string, fn: () => Promise<unknown>) => Promise<unknown>;
  error: string | null;
}

const CHECK_ICON: Record<ReadinessCheck['status'], typeof Check> = {
  pass: Check,
  warn: AlertTriangle,
  fail: CircleAlert,
  unknown: Minus,
};

const CHECK_CLASS: Record<ReadinessCheck['status'], string> = {
  pass: 'text-[color:var(--status-success)]',
  warn: 'text-[color:var(--status-warning)]',
  fail: 'text-[color:var(--status-error)]',
  unknown: 'text-muted-foreground',
};

/**
 * Developer/operator controls for the Energy POC.
 *
 * Deliberately separate from the executive view and deliberately explicit: the
 * buttons that change customer hardware say so, and the simulation buttons are
 * labelled as driving the SENSOR, not the result.
 */
export function EnergyPocControlPanel({ state, readiness, trigger, busy, run, error }: Props) {
  const [discovery, setDiscovery] = useState<DiscoveryResponse | null>(null);
  const [north, setNorth] = useState<string>('');
  const [south, setSouth] = useState<string>('');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    energyExperimentService
      .getDiscovery()
      .then((d) => {
        if (cancelled) return;
        setDiscovery(d);
        setNorth(d.configured?.northSiteId ?? d.pair.north?.siteId ?? '');
        setSouth(d.configured?.southSiteId ?? d.pair.south?.siteId ?? '');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [state?.experiment?.id]);

  const experiment = state?.experiment ?? null;
  const outstanding = state?.outstandingRestores ?? [];
  const demo = state?.demoOverride;
  const disabled = busy !== null;

  const act = (label: string, fn: () => Promise<unknown>, success?: (r: unknown) => string) =>
    run(label, fn)
      .then((r) => setNotice(success ? success(r) : null))
      .catch(() => undefined);

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Energy POC control</h3>
          <p className="text-xs text-muted-foreground">
            Operator only. Buttons marked “controller” reconfigure real access points.
          </p>
        </div>
        <span
          className={cn(
            'rounded-md px-2 py-1 text-xs font-medium',
            readiness?.ready
              ? 'bg-[color:var(--status-success)]/15 text-[color:var(--status-success)]'
              : 'bg-[color:var(--status-error)]/15 text-[color:var(--status-error)]'
          )}
        >
          {readiness?.summary ?? 'Checking…'}
        </span>
      </div>

      {outstanding.length > 0 ? (
        <div className="rounded-md border border-[color:var(--status-error)]/40 bg-[color:var(--status-error)]/10 p-3">
          <p className="text-sm font-medium text-[color:var(--status-error)]">
            {outstanding.length} access point(s) are still in a configuration this system applied.
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {outstanding.map((o) => o.apSerial).join(', ')}
          </p>
          <Button
            size="sm"
            variant="destructive"
            className="mt-2"
            disabled={disabled}
            onClick={() =>
              act('restore-all', () => energyExperimentService.restoreAll(), (r) => {
                const res = r as { unverified: unknown[]; restored: string[] };
                return res.unverified.length === 0
                  ? `Restored and verified ${res.restored.length} AP(s).`
                  : `${res.unverified.length} AP(s) still unconfirmed — check the timeline.`;
              })
            }
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Emergency restore all (controller)
          </Button>
        </div>
      ) : null}

      {/* Site pair */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs">
          <span className="font-medium text-muted-foreground">North (treatment)</span>
          <Select value={north} onValueChange={setNorth} disabled={disabled || !!experiment}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select a site" />
            </SelectTrigger>
            <SelectContent>
              {(discovery?.sites ?? []).map((s) => (
                <SelectItem key={s.siteId} value={s.siteId}>
                  {s.siteName ?? s.siteId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1 text-xs">
          <span className="font-medium text-muted-foreground">South (control)</span>
          <Select value={south} onValueChange={setSouth} disabled={disabled || !!experiment}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select a site" />
            </SelectTrigger>
            <SelectContent>
              {(discovery?.sites ?? []).map((s) => (
                <SelectItem key={s.siteId} value={s.siteId}>
                  {s.siteName ?? s.siteId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      {discovery && north && south ? (
        <p className="text-xs text-muted-foreground">
          North {discovery.membership.north.length} AP · South {discovery.membership.south.length} AP
          {discovery.anomalies.length > 0
            ? ` · ${discovery.anomalies.length} discovery warning(s)`
            : ''}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || !north || !south || north === south || !!experiment}
          onClick={() =>
            act('config', () =>
              energyExperimentService.saveConfig({
                northSiteId: north,
                northSiteName: discovery?.sites.find((s) => s.siteId === north)?.siteName ?? null,
                southSiteId: south,
                southSiteName: discovery?.sites.find((s) => s.siteId === south)?.siteName ?? null,
                enabled: true,
              })
            , () => 'Site pair saved.')
          }
        >
          Save pair
        </Button>

        <Button
          size="sm"
          disabled={disabled || !!experiment}
          onClick={() => act('start', () => energyExperimentService.start(), () => 'Experiment started; baseline collecting.')}
        >
          Start experiment
        </Button>

        <Button
          size="sm"
          variant="outline"
          disabled={disabled || experiment?.state !== 'collecting_baseline'}
          onClick={() => act('baseline', () => energyExperimentService.closeBaseline(), () => 'Baseline established.')}
        >
          Establish baseline
        </Button>

        <Button
          size="sm"
          variant="outline"
          disabled={disabled || experiment?.state !== 'baseline_established'}
          onClick={() =>
            act('activate', () => energyExperimentService.activate(true), () => 'Optimization applied and verified.')
          }
        >
          Activate now (controller)
        </Button>

        <Button
          size="sm"
          variant="destructive"
          disabled={disabled || !experiment}
          onClick={() =>
            act('restore', () => energyExperimentService.restore(experiment?.id), (r) => {
              const res = r as { ok: boolean; restored: string[]; unverified: unknown[] };
              return res.ok
                ? `North restored: ${res.restored.length} AP(s) verified.`
                : `${res.unverified.length} AP(s) NOT confirmed restored.`;
            })
          }
        >
          Restore North (controller)
        </Button>
      </div>

      {/* Demo override */}
      <div className="rounded-md border border-border p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Demo override — drives the sensor input
          </h4>
          <span
            className={cn(
              'rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
              demo?.active
                ? 'bg-[color:var(--status-warning)]/15 text-[color:var(--status-warning)]'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {demo?.active ? `Simulation: ${demo.mode}` : 'Live sensor'}
          </span>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          A simulated reading enters the same ingest, the same persistence check, the same policy and
          the same controller write as a real one. It is stored permanently marked as simulated; the
          power telemetry that follows is measured, not synthesized.
        </p>
        <div className="flex flex-wrap gap-2">
          {(['lights_off', 'lights_on', 'sensor_failure', 'reset'] as const).map((mode) => (
            <Button
              key={mode}
              size="sm"
              variant="outline"
              disabled={disabled || (mode !== 'reset' && !experiment)}
              onClick={() =>
                act(`demo-${mode}`, () => energyExperimentService.demo(mode), (r) => {
                  const res = r as { persistenceSeconds?: number };
                  return mode === 'lights_off'
                    ? `Simulating darkness. Optimization fires after ${res.persistenceSeconds ?? '?'}s of sustained dark readings.`
                    : mode === 'lights_on'
                      ? 'Simulating light restored.'
                      : mode === 'sensor_failure'
                        ? 'Sensor feed withheld; no trigger can fire.'
                        : 'Override cleared; live sensor is authoritative.';
                })
              }
            >
              {mode === 'lights_off'
                ? 'Simulate lights off'
                : mode === 'lights_on'
                  ? 'Simulate lights on'
                  : mode === 'sensor_failure'
                    ? 'Simulate sensor failure'
                    : 'Reset to live sensor'}
            </Button>
          ))}
        </div>
        {trigger?.active && trigger.darkness ? (
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            dark {trigger.darkness.satisfiedCount}/{trigger.darkness.reportingCount} reporting
            {trigger.darkness.sensorSilentCount > 0
              ? ` (${trigger.darkness.sensorSilentCount} silent)`
              : ''}
            {trigger.darkness.perAp.length > 0
              ? ` · raw ${trigger.darkness.perAp
                  .map((a) => (a.latestRaw == null ? '—' : a.latestRaw))
                  .join(', ')}`
              : ''}
          </p>
        ) : null}
      </div>

      {notice ? <p className="text-xs text-foreground">{notice}</p> : null}
      {error ? <p className="text-xs text-[color:var(--status-error)]">{error}</p> : null}

      {/* Readiness detail */}
      {readiness ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Readiness detail</summary>
          <ul className="mt-2 space-y-1">
            {readiness.checks.map((c) => {
              const Icon = CHECK_ICON[c.status];
              return (
                <li key={c.id} className="flex gap-2">
                  <Icon className={cn('mt-0.5 h-3 w-3 shrink-0', CHECK_CLASS[c.status])} aria-hidden />
                  <span>
                    <span className="font-medium text-foreground">{c.label}:</span>{' '}
                    <span className="text-muted-foreground">{c.detail}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}
