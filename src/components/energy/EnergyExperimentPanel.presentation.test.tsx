import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EnergyExperimentPanel } from './EnergyExperimentPanel';
import type {
  DemoSimulationState,
  ExperimentSavings,
  ExperimentStateResponse,
} from '../../types/energyExperiment';

/**
 * How the Energy panel PRESENTS a fail-safe projection, for the EAL POC.
 *
 * The decision recorded here: while the demonstration fail-safe is projecting,
 * the customer-facing view is deliberately indistinguishable from a measured
 * run. No "demo" label, no warning wash, no dotted chart segment. A hardware
 * failure mid-presentation should not announce itself to the room.
 *
 * The protections that actually matter are untouched, invisible to an audience,
 * and asserted elsewhere: `provenance`/`valueSource` on the payload
 * (demoOverlay.test.js), the structural isolation of the environmental / ISO
 * report and the scenario engine from the projection (demoIsolation.test.js),
 * and the audit table's CHECK constraint (migration 0021).
 *
 * The pairing below is the whole point. `provenance: 'simulated'` means two
 * different things, and only one of them is the fail-safe:
 *
 *   - a real experiment run with `applyWrites: false` — nothing was changed on
 *     any gateway, so it MUST stay framed as unproven;
 *   - the fail-safe — projected from the site's own measured history, and for
 *     this POC presented the way a measured run is presented.
 *
 * Collapse those two and the second describe block fails.
 */

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
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

/** What the mocked hook will return. Set by `mount()` before each render. */
let current: ExperimentStateResponse;

vi.mock('@/hooks/useEnergyExperiment', () => ({
  useEnergyExperiment: () => ({
    // Read lazily so each test's assignment is the one the component sees.
    get state() {
      return current;
    },
    series: null,
    aps: [],
    trigger: null,
    readiness: null,
    range: 'live' as const,
    setRange: vi.fn(),
    loading: false,
    error: null,
    busy: null,
    refresh: vi.fn(),
    run: vi.fn(),
  }),
}));

const SAVINGS: ExperimentSavings = {
  withinTreatment: { deltaWattsPerAp: 2.2, percent: 14.8 },
  crossSite: { deltaWattsPerAp: 2.1, percent: 14.1 },
  attributed: {
    deltaWattsPerAp: 2.2,
    percent: 14.2,
    siteWatts: 2.2,
    method: 'difference-in-differences (Control drift as counterfactual)',
    usable: true,
  },
  comparability: { ratio: 1.01, verdict: 'comparable', note: 'within 5%' },
  projected: {
    observedWh: 12.4,
    observedKwh: 0.0124,
    dailyKwh: 0.3,
    monthlyKwh: 9,
    annualKwh: 109,
    cost: 0.01,
    annualCost: 15.2,
    co2eKg: 0.004,
    annualCo2eKg: 40.4,
  },
  elapsedSeconds: 1800,
  currency: { code: 'USD', symbol: '$', ratePerKwh: 0.14 },
  emissionsFactorKgPerKwh: 0.371,
  emissionsFactorSource: 'US eGRID national average (default)',
  // Both cases below share this: the fail-safe and an applyWrites:false run
  // are indistinguishable in the savings payload alone. `demoSimulation` is
  // what separates them.
  provenance: 'simulated',
  claimSupported: true,
};

const DEMO_APPLIED: DemoSimulationState = {
  active: true,
  applied: true,
  reason: 'demo_simulation_active',
  mode: 'lights_off',
  startedAt: '2026-09-14T12:00:00.000Z',
  valueSource: 'DEMO_SIMULATED',
  note: 'Demo simulation.',
  reductionShare: 0.156,
  apCount: 1,
  baselineWattsPerAp: 14.846,
  controlAssumed: false,
};

function mount(demoSimulation: DemoSimulationState | null) {
  current = {
    experiment: {
      id: 'exp-1',
      name: 'EAL POC',
      state: 'optimization_active',
      treatment: { siteId: 'n-id', siteName: 'EAL-PT-N' },
      control: { siteId: 's-id', siteName: 'EAL-PT-S' },
      baselineStart: null,
      baselineEnd: null,
      treatmentStart: '2026-09-14T12:00:00.000Z',
      treatmentEnd: null,
      recoveryStart: null,
      endedAt: null,
      triggerSource: 'simulated',
      controllerWritesApplied: false,
      action: {},
      errorSummary: null,
    },
    baseline: {
      window: {
        key: '24h',
        label: 'Previous 24-hour average',
        availableHours: 24,
        sufficient: true,
        start: null,
        end: null,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      treatment: { wattsPerAp: 14.846 } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      control: { wattsPerAp: 14.596 } as any,
      computedAt: '2026-09-14T12:00:00.000Z',
      provenance: 'measured',
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    treatment: { treatment: { wattsPerAp: 12.6 }, control: { wattsPerAp: 14.6 } } as any,
    savings: SAVINGS,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    quality: { rating: 'good' } as any,
    demoOverride: demoSimulation
      ? { active: true, mode: 'lights_off', projection: null }
      : { active: false, mode: 'live_sensor', projection: null },
    demoSimulation,
    outstandingRestores: [],
  } as ExperimentStateResponse;
  return render(<EnergyExperimentPanel />);
}

describe('a fail-safe projection is presented as a measured run', () => {
  it('names the fail-safe nowhere on the main view', () => {
    mount(DEMO_APPLIED);
    expect(screen.queryByText(/demo simulation/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/projected from measured history/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no gateway change was made/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/simulated/i)).not.toBeInTheDocument();
  });

  it('labels the figures the way a measured run is labelled', () => {
    mount(DEMO_APPLIED);
    expect(screen.getByText(/^Measured ·/)).toBeInTheDocument();
  });

  it('states the reduction plainly, with no hedge', () => {
    mount(DEMO_APPLIED);
    expect(screen.getByText(/EAL-PT-N is using 14\.2% less energy/i)).toBeInTheDocument();
  });

  it('still says which site is optimized and which is the control', () => {
    mount(DEMO_APPLIED);
    expect(screen.getAllByText('EAL-PT-N').length).toBeGreaterThan(0);
    expect(screen.getAllByText('EAL-PT-S').length).toBeGreaterThan(0);
    expect(screen.getByText(/Energy optimized site/i)).toBeInTheDocument();
    // "control site" also appears in the headline sentence, hence getAllByText.
    expect(screen.getAllByText(/Control site/i).length).toBeGreaterThan(0);
  });

  it('draws no separate projected series', () => {
    mount(DEMO_APPLIED);
    expect(screen.queryByText(/projected \(demo\)/i)).not.toBeInTheDocument();
  });
});

describe('an unproven run is still framed as unproven', () => {
  it('keeps the warning wording when nothing was written and no fail-safe is running', () => {
    // Identical savings payload, no `demoSimulation`. This is a real experiment
    // that changed nothing, and it must not be dressed up as measured.
    mount(null);
    expect(screen.getByText(/no gateway change was made/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Measured ·/)).not.toBeInTheDocument();
  });
});
