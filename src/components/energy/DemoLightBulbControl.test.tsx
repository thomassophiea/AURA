import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DemoLightBulbControl } from './DemoLightBulbControl';
import type { DemoOverrideState, DemoSimulationState } from '../../types/energyExperiment';

// Radix Popover measures its trigger and observes resizes; jsdom has neither.
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(globalThis as any).ResizeObserver) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

afterEach(() => vi.restoreAllMocks());

const liveSensor: DemoOverrideState = { active: false, mode: 'live_sensor', projection: null };

const lightsOffOverride: DemoOverrideState = {
  active: true,
  mode: 'lights_off',
  startedAt: '2026-09-14T12:00:00.000Z',
  projection: {
    mode: 'lights_off',
    startedAt: '2026-09-14T12:00:00.000Z',
    fromShare: 0,
    episodeId: 'ep-1',
  },
};

const applied: DemoSimulationState = {
  active: true,
  applied: true,
  reason: 'demo_simulation_active',
  mode: 'lights_off',
  startedAt: '2026-09-14T12:00:00.000Z',
  valueSource: 'DEMO_SIMULATED',
  note: 'Demo simulation.',
  reductionShare: 0.158,
  apCount: 1,
  baselineWattsPerAp: 14.846,
  controlAssumed: false,
};

function setup(props: Partial<Parameters<typeof DemoLightBulbControl>[0]> = {}) {
  const onSelect = vi.fn();
  render(
    <DemoLightBulbControl
      override={liveSensor}
      simulation={null}
      siteName="EAL-PT-N"
      onSelect={onSelect}
      {...props}
    />
  );
  const user = {
    click: async (el: Element) => fireEvent.click(el),
    hover: async (el: Element) => fireEvent.mouseOver(el),
  };
  return { onSelect, user };
}

describe('DemoLightBulbControl — discretion', () => {
  it('renders as a single unlabelled icon button, not a panel', () => {
    setup();
    const trigger = screen.getByRole('button', { name: /open demo light control/i });
    expect(trigger).toBeInTheDocument();
    // Nothing about the simulation is on screen until it is opened.
    expect(screen.queryByText(/Lights off/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/DEMO MODE/i)).not.toBeInTheDocument();
  });

  it('sits in the bottom corner at low opacity until approached', () => {
    setup();
    const trigger = screen.getByRole('button', { name: /open demo light control/i });
    expect(trigger.className).toMatch(/fixed/);
    expect(trigger.className).toMatch(/bottom-4/);
    expect(trigger.className).toMatch(/right-4/);
    expect(trigger.className).toMatch(/opacity-40/);
  });
});

describe('DemoLightBulbControl — protected against accidents', () => {
  it('does nothing on hover', async () => {
    const { onSelect, user } = setup();
    await user.hover(screen.getByRole('button', { name: /open demo light control/i }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^Lights off/i })).not.toBeInTheDocument();
  });

  it('does nothing on the first click — it only opens the panel', async () => {
    const { onSelect, user } = setup();
    await user.click(screen.getByRole('button', { name: /open demo light control/i }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: /^Lights off/i })).toBeInTheDocument();
  });

  it('takes a second, deliberate click on a named choice', async () => {
    const { onSelect, user } = setup();
    await user.click(screen.getByRole('button', { name: /open demo light control/i }));
    await user.click(await screen.findByRole('button', { name: /^Lights off/i }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('lights_off');
  });

  it('disables the state already in effect, so a double-click cannot toggle twice', async () => {
    const { onSelect, user } = setup({ override: lightsOffOverride, simulation: applied });
    await user.click(screen.getByRole('button', { name: /open demo light control/i }));
    const choice = await screen.findByRole('button', { name: /^Lights off/i });
    expect(choice).toBeDisabled();
    await user.click(choice);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('disables every choice while a command is in flight', async () => {
    const { user } = setup({ busy: true });
    await user.click(screen.getByRole('button', { name: /open demo light control/i }));
    expect(await screen.findByRole('button', { name: /^Lights off/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Lights on/i })).toBeDisabled();
  });
});

describe('DemoLightBulbControl — state is legible once interacted with', () => {
  it('shows the live sensor as authoritative by default', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /open demo light control/i }));
    expect(await screen.findByText(/Live sensor is authoritative/i)).toBeInTheDocument();
    expect(screen.getByText(/Every figure on screen is measured/i)).toBeInTheDocument();
  });

  it('marks the trigger when a simulation is running', () => {
    setup({ override: lightsOffOverride, simulation: applied });
    const trigger = screen.getByRole('button', { name: /Demo simulation active/i });
    expect(trigger.className).toMatch(/ring-\[color:var\(--status-warning\)\]/);
  });

  it('names the optimized site it applies to', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /open demo light control/i }));
    expect(await screen.findByText('EAL-PT-N')).toBeInTheDocument();
    expect(screen.getByText(/control site is never affected/i)).toBeInTheDocument();
  });

  it('reports what the projection is built from', async () => {
    const { user } = setup({ override: lightsOffOverride, simulation: applied });
    await user.click(screen.getByRole('button', { name: /Demo simulation active/i }));
    expect(await screen.findByText(/15\.8% reduction in effect/)).toBeInTheDocument();
    expect(screen.getByText(/14\.85 W\/AP baseline/)).toBeInTheDocument();
    expect(screen.getByText(/No gateway configuration was changed/i)).toBeInTheDocument();
  });

  it('says so when the real optimization is working and the simulation stood down', async () => {
    const { user } = setup({
      override: lightsOffOverride,
      simulation: { ...applied, applied: false, reason: 'real_telemetry_preferred' },
    });
    await user.click(screen.getByRole('button', { name: /Demo simulation active/i }));
    expect(await screen.findByText(/real optimization is working/i)).toBeInTheDocument();
  });

  it('says so when there is no measured history to project from', async () => {
    const { user } = setup({
      override: lightsOffOverride,
      simulation: {
        ...applied,
        applied: false,
        reason: 'no_measured_baseline',
        note: 'Nothing is being simulated — the figures on screen remain real.',
      },
    });
    await user.click(screen.getByRole('button', { name: /Demo simulation active/i }));
    expect(await screen.findByText(/the figures on screen remain real/i)).toBeInTheDocument();
  });

  it('describes a simulated sensor failure as a dead sensor', async () => {
    const { user } = setup({
      override: { active: true, mode: 'sensor_failure', projection: null },
      simulation: null,
    });
    await user.click(screen.getByRole('button', { name: /Demo simulation active/i }));
    expect(await screen.findByText(/no trigger can fire/i)).toBeInTheDocument();
  });
});

describe('DemoLightBulbControl — exiting the simulation', () => {
  it('offers a route back to the live sensor only while simulating', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /open demo light control/i }));
    expect(screen.queryByRole('button', { name: /Back to live sensor/i })).not.toBeInTheDocument();
  });

  it('resets to the live sensor on request', async () => {
    const { onSelect, user } = setup({ override: lightsOffOverride, simulation: applied });
    await user.click(screen.getByRole('button', { name: /Demo simulation active/i }));
    await user.click(await screen.findByRole('button', { name: /Back to live sensor/i }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('reset');
  });

  it('returns the optimized site to normal on lights on', async () => {
    const { onSelect, user } = setup({ override: lightsOffOverride, simulation: applied });
    await user.click(screen.getByRole('button', { name: /Demo simulation active/i }));
    await user.click(await screen.findByRole('button', { name: /^Lights on/i }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('lights_on');
  });
});
