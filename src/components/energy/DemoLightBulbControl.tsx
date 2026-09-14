import { useState } from 'react';
import { Lightbulb, LightbulbOff, RotateCcw } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/components/ui/utils';
import type { DemoOverrideState, DemoSimulationState } from '@/types/energyExperiment';

export type DemoLightMode = 'lights_off' | 'lights_on' | 'reset';

interface Props {
  /** The live override, straight from the server. */
  override: DemoOverrideState | null | undefined;
  /** Whether the projection is actually replacing figures, and why. */
  simulation: DemoSimulationState | null | undefined;
  /** The optimized site the simulation applies to. */
  siteName: string | null;
  busy?: boolean;
  onSelect: (mode: DemoLightMode) => void;
}

/**
 * The demonstration fail-safe, as a light bulb in the corner of the screen.
 *
 * WHY IT LOOKS LIKE THIS
 * ----------------------
 * The EAL proof-of-concept is given in front of customers, and the thing being
 * demonstrated depends on an ambient-light sensor on a real AP, a radio write
 * to real hardware, a controller that answers, and a collector that keeps up.
 * Any one of those can fail mid-sentence. This is how the presenter recovers
 * without the recovery becoming the story.
 *
 * So it is deliberately quiet: a 28px bulb in the bottom corner at low opacity,
 * no banner, no badge on the dashboard, nothing that competes with the Energy
 * view a customer is looking at. It reads as an icon, not as a mode.
 *
 * PROTECTED AGAINST ACCIDENTS
 * ---------------------------
 * Nothing happens on hover, and nothing happens on the first click. Opening the
 * bulb shows a small panel; changing state takes a second, deliberate click on a
 * named choice. The option matching the current state is disabled, so a
 * double-click cannot toggle twice, and the panel stays open after a choice so
 * the presenter can see what they did.
 *
 * HONEST WITHOUT BEING LOUD
 * -------------------------
 * The panel itself says plainly what is simulated and what is not. The one-line
 * provenance note under the Energy headline is the only mark this leaves on the
 * customer-facing view — no wash of warning colour across the page, and no
 * claim that anything measured was measured when it was not.
 */
export function DemoLightBulbControl({
  override,
  simulation,
  siteName,
  busy = false,
  onSelect,
}: Props) {
  const [open, setOpen] = useState(false);

  const mode = override?.mode ?? 'live_sensor';
  const lightsOff = mode === 'lights_off';
  const simulating = Boolean(override?.active) && mode !== 'live_sensor';
  const site = siteName ?? 'the optimized site';

  const Icon = lightsOff ? LightbulbOff : Lightbulb;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          // `title`/aria carry the meaning; there is deliberately no visible
          // label, because a labelled control in the corner of a customer
          // demonstration is a question waiting to be asked.
          aria-label={
            simulating
              ? `Demo simulation active: ${mode.replace('_', ' ')}. Open demo light control.`
              : 'Open demo light control'
          }
          title={simulating ? `Demo simulation: ${mode.replace('_', ' ')}` : 'Demo light control'}
          className={cn(
            'fixed bottom-4 right-4 z-40 flex h-7 w-7 items-center justify-center rounded-full',
            'border border-border bg-background/80 backdrop-blur transition-all',
            // Low-contrast at rest, findable on approach. Never invisible: a
            // control the presenter cannot locate under pressure is useless.
            'opacity-40 hover:opacity-100 focus-visible:opacity-100',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            open && 'opacity-100',
            simulating && 'opacity-100 ring-1 ring-[color:var(--status-warning)]'
          )}
        >
          <Icon
            className={cn(
              'h-3.5 w-3.5',
              lightsOff
                ? 'text-[color:var(--status-warning)]'
                : simulating
                  ? 'text-[color:var(--status-warning)]'
                  : 'text-muted-foreground'
            )}
            aria-hidden
          />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" side="top" className="w-72 p-3">
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold text-foreground">Demo light control</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              Fail-safe for the live demonstration. Simulates the lights-off condition at{' '}
              <span className="font-medium text-foreground">{site}</span> if the sensor, the AP or
              the gateway does not cooperate. The control site is never affected.
            </p>
          </div>

          <div className="space-y-1.5">
            <Choice
              icon={Lightbulb}
              label="Lights on"
              detail="Normal operating consumption"
              active={mode === 'lights_on'}
              disabled={busy || mode === 'lights_on'}
              onClick={() => onSelect('lights_on')}
            />
            <Choice
              icon={LightbulbOff}
              label="Lights off"
              detail="Energy optimization engages"
              active={lightsOff}
              disabled={busy || lightsOff}
              onClick={() => onSelect('lights_off')}
            />
            {simulating ? (
              <Choice
                icon={RotateCcw}
                label="Back to live sensor"
                detail="Real readings become authoritative"
                active={false}
                disabled={busy}
                onClick={() => onSelect('reset')}
              />
            ) : null}
          </div>

          <StatusLine simulating={simulating} simulation={simulation} mode={mode} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface ChoiceProps {
  icon: typeof Lightbulb;
  label: string;
  detail: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}

function Choice({ icon: Icon, label, detail, active, disabled, onClick }: ChoiceProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors',
        'disabled:cursor-not-allowed',
        active
          ? 'border-[color:var(--status-warning)]/50 bg-[color:var(--status-warning)]/10'
          : 'border-border hover:bg-accent disabled:opacity-50'
      )}
    >
      <Icon
        className={cn(
          'h-3.5 w-3.5 shrink-0',
          active ? 'text-[color:var(--status-warning)]' : 'text-muted-foreground'
        )}
        aria-hidden
      />
      <span className="min-w-0">
        <span className="block text-xs font-medium text-foreground">{label}</span>
        <span className="block text-[10px] text-muted-foreground">{detail}</span>
      </span>
      {active ? (
        <span className="ml-auto text-[10px] font-medium uppercase tracking-wide text-[color:var(--status-warning)]">
          On
        </span>
      ) : null}
    </button>
  );
}

/**
 * What is actually happening, in one line.
 *
 * Distinguishes the three outcomes that matter and that a presenter would
 * otherwise have to guess between: the projection is on screen; the projection
 * stood down because the real hardware is working; or it cannot run because
 * there is no measured history to project from.
 */
function StatusLine({
  simulating,
  simulation,
  mode,
}: {
  simulating: boolean;
  simulation: DemoSimulationState | null | undefined;
  mode: string;
}) {
  if (!simulating) {
    return (
      <p className="border-t border-border pt-2 text-[10px] leading-snug text-muted-foreground">
        Live sensor is authoritative. Every figure on screen is measured.
      </p>
    );
  }

  if (mode === 'sensor_failure') {
    return (
      <p className="border-t border-border pt-2 text-[10px] leading-snug text-[color:var(--status-warning)]">
        Simulating a dead sensor: no readings are being written, so no trigger can fire.
      </p>
    );
  }

  if (simulation?.applied) {
    const pct =
      simulation.reductionShare == null ? null : (simulation.reductionShare * 100).toFixed(1);
    return (
      <div className="space-y-1 border-t border-border pt-2">
        <p className="text-[10px] font-medium text-[color:var(--status-warning)]">
          Projecting from measured history
          {pct ? ` · ${pct}% reduction in effect` : ''}
          {simulation.apCount ? ` · ${simulation.apCount} AP` : ''}
        </p>
        <p className="text-[10px] leading-snug text-muted-foreground">
          Derived from this site&rsquo;s own real power readings
          {simulation.baselineWattsPerAp != null
            ? ` (${simulation.baselineWattsPerAp.toFixed(2)} W/AP baseline)`
            : ''}
          . No gateway configuration was changed and no telemetry was altered.
        </p>
        {simulation.controlAssumed ? (
          <p className="text-[10px] leading-snug text-muted-foreground">
            The control site has no live reading; it is held at its own baseline.
          </p>
        ) : null}
      </div>
    );
  }

  if (simulation?.reason === 'real_telemetry_preferred') {
    return (
      <p className="border-t border-border pt-2 text-[10px] leading-snug text-[color:var(--status-success)]">
        The real optimization is working — measured figures are on screen and the simulation is
        standing by.
      </p>
    );
  }

  return (
    <p className="border-t border-border pt-2 text-[10px] leading-snug text-muted-foreground">
      {simulation?.note ??
        'Simulation is on, but there is no measured power history at the optimized site to project from.'}
    </p>
  );
}

export default DemoLightBulbControl;
