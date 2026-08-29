/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { EventAlarmDashboard } from './EventAlarmDashboard';
import { apiService } from '../services/api';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('../services/api', () => ({
  apiService: {
    getAuditLogs: vi.fn(),
    getAlarms: vi.fn(),
    getActiveAlarms: vi.fn(),
    acknowledgeAlarm: vi.fn(),
    clearAlarm: vi.fn(),
  },
}));

// Lightweight AGGridWrapper stand-in: exposes row count + storage key, and
// renders the actions column's real cell renderer so the acknowledge/clear
// flow can be exercised without booting AG Grid in jsdom.
vi.mock('./ui/AGGridWrapper', () => ({
  AGGridWrapper: ({ rowData, columnDefs, storageKey }: any) => (
    <div data-testid={`grid-${storageKey}`} data-row-count={rowData.length}>
      {columnDefs
        .filter((c: any) => c.colId === 'actions')
        .flatMap((c: any) =>
          rowData.map((row: any, i: number) => {
            const Renderer = c.cellRenderer;
            return <Renderer key={row.id ?? i} data={row} {...c.cellRendererParams} />;
          })
        )}
    </div>
  ),
}));

/** Radix TabsTrigger activates on mousedown; click alone is not enough. */
function switchToTab(tab: HTMLElement) {
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
}

const mockApi = apiService as unknown as {
  getAuditLogs: ReturnType<typeof vi.fn>;
  getAlarms: ReturnType<typeof vi.fn>;
  getActiveAlarms: ReturnType<typeof vi.fn>;
  acknowledgeAlarm: ReturnType<typeof vi.fn>;
  clearAlarm: ReturnType<typeof vi.fn>;
};

const auditLog = {
  action: 'UPDATE_SERVICE',
  description: 'Service Skynet updated',
  timestamp: Date.now() - 60_000,
  user: 'admin',
};

const criticalAlarm = {
  id: 'alarm-1',
  title: 'AP down',
  severity: 'critical',
  message: 'AP4000-Lobby unreachable',
  timestamp: Date.now() - 120_000,
};

function seedApi({
  events = [auditLog],
  alarms = [criticalAlarm],
  active = [criticalAlarm],
}: { events?: any[]; alarms?: any[]; active?: any[] } = {}) {
  mockApi.getAuditLogs.mockResolvedValue(events);
  mockApi.getAlarms.mockResolvedValue(alarms);
  mockApi.getActiveAlarms.mockResolvedValue(active);
}

describe('EventAlarmDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.acknowledgeAlarm.mockResolvedValue(undefined);
    mockApi.clearAlarm.mockResolvedValue(undefined);
  });

  it('renders KPI metric cards with correct counts', async () => {
    seedApi();
    render(<EventAlarmDashboard />);

    await screen.findByText('Active Alarms', { selector: 'span' });
    expect(screen.getByText('Total Alarms')).toBeInTheDocument();
    expect(screen.getByText('Recent Events')).toBeInTheDocument();
    expect(screen.getByText('Critical Issues')).toBeInTheDocument();
    // Active Alarms (1), Total Alarms (1), Recent Events (1), Critical Issues (1)
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(4);
  });

  it('shows tab counts and renders the active alarms grid with actions', async () => {
    seedApi();
    render(<EventAlarmDashboard />);

    await screen.findByRole('tab', { name: /active alarms \(1\)/i });
    expect(screen.getByRole('tab', { name: /all alarms \(1\)/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /events \(1\)/i })).toBeInTheDocument();

    const grid = await screen.findByTestId('grid-active-alarms');
    expect(grid).toHaveAttribute('data-row-count', '1');
  });

  it('acknowledges an alarm and reloads data', async () => {
    seedApi();
    render(<EventAlarmDashboard />);

    const ack = await screen.findByRole('button', { name: /acknowledge alarm: AP down/i });
    fireEvent.click(ack);

    await waitFor(() => expect(mockApi.acknowledgeAlarm).toHaveBeenCalledWith('alarm-1'));
    await waitFor(() => expect(mockApi.getActiveAlarms).toHaveBeenCalledTimes(2));
  });

  it('clears an alarm via the actions column', async () => {
    seedApi();
    render(<EventAlarmDashboard />);

    const clear = await screen.findByRole('button', { name: /clear alarm: AP down/i });
    fireEvent.click(clear);

    await waitFor(() => expect(mockApi.clearAlarm).toHaveBeenCalledWith('alarm-1'));
  });

  it('keeps the positive empty state instead of an empty grid when no active alarms', async () => {
    seedApi({ active: [] });
    render(<EventAlarmDashboard />);

    await screen.findByText('No active alarms');
    expect(screen.getByText('All systems operating normally')).toBeInTheDocument();
    expect(screen.queryByTestId('grid-active-alarms')).not.toBeInTheDocument();
  });

  it('renders the events grid on the Events tab', async () => {
    seedApi();
    render(<EventAlarmDashboard />);

    const eventsTab = await screen.findByRole('tab', { name: /events \(1\)/i });
    switchToTab(eventsTab);

    const grid = await screen.findByTestId('grid-events');
    expect(grid).toHaveAttribute('data-row-count', '1');
  });

  it('shows the events empty state when the audit log API fails', async () => {
    seedApi();
    mockApi.getAuditLogs.mockRejectedValue(new Error('boom'));
    render(<EventAlarmDashboard />);

    const eventsTab = await screen.findByRole('tab', { name: /events \(0\)/i });
    switchToTab(eventsTab);

    expect(await screen.findByText('No recent events')).toBeInTheDocument();
    expect(screen.queryByTestId('grid-events')).not.toBeInTheDocument();
  });

  it('refresh button reloads all three data sources', async () => {
    seedApi();
    render(<EventAlarmDashboard />);

    const refresh = await screen.findByRole('button', { name: /refresh events and alarms/i });
    fireEvent.click(refresh);

    await waitFor(() => {
      expect(mockApi.getAuditLogs).toHaveBeenCalledTimes(2);
      expect(mockApi.getAlarms).toHaveBeenCalledTimes(2);
      expect(mockApi.getActiveAlarms).toHaveBeenCalledTimes(2);
    });
  });
});
