import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EnergyPocControlPanel } from './EnergyPocControlPanel';
import type { ExperimentStateResponse } from '@/types/energyExperiment';

const service = vi.hoisted(() => ({
  getDiscovery: vi.fn(),
  activate: vi.fn(),
  restore: vi.fn(),
  restoreAll: vi.fn(),
  saveConfig: vi.fn(),
  start: vi.fn(),
  closeBaseline: vi.fn(),
  demo: vi.fn(),
}));

vi.mock('@/services/energyExperimentService', () => ({ energyExperimentService: service }));

const state = {
  experiment: { id: 'exp-1', state: 'baseline_established' },
  devices: [
    { side: 'treatment', apSerial: 'SN1' },
    { side: 'treatment', apSerial: 'SN2' },
    { side: 'control', apSerial: 'SN9' },
  ],
  outstandingRestores: [],
  demoOverride: { active: false },
} as unknown as ExperimentStateResponse;

function renderPanel(run = vi.fn((_label: string, fn: () => Promise<unknown>) => fn())) {
  render(
    <EnergyPocControlPanel state={state} readiness={null} trigger={null} busy={null} run={run} error={null} />
  );
  return run;
}

beforeEach(() => {
  vi.clearAllMocks();
  service.getDiscovery.mockResolvedValue({
    sites: [],
    pair: {},
    membership: { treatment: [], control: [] },
    anomalies: [],
    configured: null,
  });
});

describe('EnergyPocControlPanel controller writes', () => {
  it('asks for confirmation before activating, and cancel writes nothing', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Activate now \(controller\)/i }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(/Disable radios on the Treatment site/);
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/2 enrolled/);
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(service.activate).not.toHaveBeenCalled();
  });

  it('reports the real applied/skipped counts after a confirmed activation', async () => {
    service.activate.mockResolvedValue({
      ok: true,
      targetCount: 2,
      appliedCount: 1,
      effectiveCount: 1,
      skippedCount: 1,
      failedCount: 0,
      skipped: [{ serial: 'SN2', reason: 'clients_present' }],
      failed: [],
    });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Activate now \(controller\)/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^Activate$/ }));
    await waitFor(() => expect(service.activate).toHaveBeenCalledWith(true));
    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent(
      'Applied to 1/2 Treatment AP(s); 1 confirmed off the air; 1 skipped (1 clients connected).'
    );
    expect(notice).not.toHaveTextContent(/applied and verified/i);
  });

  it('confirms before restoring the treatment site', async () => {
    service.restore.mockResolvedValue({ ok: true, restored: ['SN1'], unverified: [] });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Restore treatment site \(controller\)/i }));
    expect(service.restore).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: /^Restore$/ }));
    await waitFor(() => expect(service.restore).toHaveBeenCalledWith('exp-1'));
  });
});
