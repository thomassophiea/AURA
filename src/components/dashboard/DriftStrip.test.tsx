import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Hoist mocks so they're available inside vi.mock factories.
const {
  useAppContext,
  getTemplates,
  getVariableDefinitions,
  getVariableValues,
  getAssignmentsByOrg,
  checkAll,
} = vi.hoisted(() => ({
  useAppContext: vi.fn(),
  getTemplates: vi.fn(),
  getVariableDefinitions: vi.fn(),
  getVariableValues: vi.fn(),
  getAssignmentsByOrg: vi.fn(),
  checkAll: vi.fn(),
}));

vi.mock('../../contexts/AppContext', () => ({
  useAppContext,
}));
vi.mock('../../services/globalElementsService', () => ({
  globalElementsService: {
    getTemplates,
    getVariableDefinitions,
    getVariableValues,
    getAssignmentsByOrg,
  },
}));
vi.mock('../../services/driftDetectionService', () => ({
  driftDetectionService: { checkAll },
}));

import { DriftStrip } from './DriftStrip';

beforeEach(() => {
  useAppContext.mockReset();
  useAppContext.mockReturnValue({
    organization: { id: 'org-1', name: 'Test Org' },
    siteGroups: [],
  });
  getTemplates.mockReset();
  getTemplates.mockResolvedValue([]);
  getVariableDefinitions.mockReset();
  getVariableDefinitions.mockResolvedValue([]);
  getVariableValues.mockReset();
  getVariableValues.mockResolvedValue([]);
  getAssignmentsByOrg.mockReset();
  getAssignmentsByOrg.mockResolvedValue([]);
  checkAll.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('DriftStrip', () => {
  it('renders nothing when org has no templates', async () => {
    getTemplates.mockResolvedValue([]); // unavailable path
    const { container } = render(<DriftStrip />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('renders nothing when there is no organization in context', async () => {
    useAppContext.mockReturnValue({ organization: null, siteGroups: [] });
    const { container } = render(<DriftStrip />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('shows the in-sync state when all templates are in_sync', async () => {
    getTemplates.mockResolvedValue([{ id: 't-1' }]);
    checkAll.mockResolvedValue({
      total: 5,
      in_sync: 5,
      drifted: 0,
      missing: 0,
      errors: 0,
      results: [],
      checked_at: new Date().toISOString(),
    });
    render(<DriftStrip />);
    await waitFor(() => {
      expect(screen.getByText('CONFIG IN SYNC')).toBeInTheDocument();
    });
    expect(screen.getByText(/5 templates verified/)).toBeInTheDocument();
  });

  it('shows the drift-detected state when any item is drifted/missing/error', async () => {
    getTemplates.mockResolvedValue([{ id: 't-1' }]);
    checkAll.mockResolvedValue({
      total: 5,
      in_sync: 2,
      drifted: 2,
      missing: 1,
      errors: 0,
      results: [],
      checked_at: new Date().toISOString(),
    });
    render(<DriftStrip />);
    await waitFor(() => {
      expect(screen.getByText(/DRIFT DETECTED — 3 items/)).toBeInTheDocument();
    });
    expect(screen.getByText('2 drifted')).toBeInTheDocument();
    expect(screen.getByText('1 missing')).toBeInTheDocument();
  });

  it('uses singular "1 item" when only 1 thing is drifted', async () => {
    getTemplates.mockResolvedValue([{ id: 't-1' }]);
    checkAll.mockResolvedValue({
      total: 1,
      in_sync: 0,
      drifted: 1,
      missing: 0,
      errors: 0,
      results: [],
      checked_at: new Date().toISOString(),
    });
    render(<DriftStrip />);
    await waitFor(() => {
      expect(screen.getByText(/DRIFT DETECTED — 1 item$/)).toBeInTheDocument();
    });
  });

  it('shows the error strip with retry when checkAll throws', async () => {
    getTemplates.mockResolvedValue([{ id: 't-1' }]);
    checkAll.mockRejectedValue(new Error('controller down'));
    render(<DriftStrip />);
    await waitFor(() => {
      expect(screen.getByText(/Drift check unavailable: controller down/)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });

  it('shows the error strip when getTemplates rejects', async () => {
    getTemplates.mockRejectedValue(new Error('templates rpc fail'));
    render(<DriftStrip />);
    await waitFor(() => {
      expect(screen.getByText(/Drift check unavailable/)).toBeInTheDocument();
    });
  });

  it('Recheck button re-runs checkAll', async () => {
    getTemplates.mockResolvedValue([{ id: 't-1' }]);
    checkAll.mockResolvedValue({
      total: 1,
      in_sync: 1,
      drifted: 0,
      missing: 0,
      errors: 0,
      results: [],
      checked_at: new Date().toISOString(),
    });
    render(<DriftStrip />);
    await waitFor(() => screen.getByText('CONFIG IN SYNC'));
    expect(checkAll).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Recheck/i }));
    await waitFor(() => {
      expect(checkAll).toHaveBeenCalledTimes(2);
    });
  });
});
