import { describe, it, expect, vi, beforeEach } from 'vitest';
// fireEvent rather than @testing-library/user-event: user-event is not a dependency of
// this project, and a plain click needs no simulated pointer sequence.
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { APInsightsFullScreen } from './APInsights';
import * as apiService from '../services/api';
import { AP5020_INSIGHTS_3H, SPIKE_TIMESTAMP } from '../test/fixtures/apInsights.fixture';
import { AP5020_DETAILS } from '../test/fixtures/apDetails.fixture';

// Mock the API service
vi.mock('../services/api', () => ({
  apiService: {
    getAccessPointInsights: vi.fn(),
    getAccessPointDetails: vi.fn(),
  },
}));

// Timeline state is driven per-test so the locked-state cases can exercise the
// power context card, which only renders while the timeline is locked.
const timelineState = {
  currentTime: null as number | null,
  isLocked: false,
};

// These tests exercise the *controller-served* path: the fixture is a controller
// report payload. The app's default window is 24 hours, which the Gateway cannot
// serve (see `controllerCanServeApReport`) and which therefore routes to stored
// history instead — so the window is pinned here to one the Gateway does answer.
vi.mock('../hooks/useSelectedTimeRange', () => ({
  useSelectedTimeRange: () => {
    const end = new Date('2026-08-17T12:00:00.000Z');
    const start = new Date(end.getTime() - 60 * 60 * 1000);
    return {
      token: '1h',
      range: {
        token: '1h',
        kind: 'rolling',
        start,
        end,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        dayOffset: null,
        localDate: null,
        label: 'Last hour',
        rangeLabel: 'Last hour',
        isLive: true,
        bucketMinutes: 15,
        durationMs: 60 * 60 * 1000,
      },
      setToken: vi.fn(),
      optionGroups: [],
      dayStatuses: [],
      selectedCoverage: null,
      retentionDays: 30,
      neverCollected: false,
      coverageLoading: false,
      coverageError: null,
      refreshCoverage: vi.fn(),
    };
  },
}));

vi.mock('../hooks/useTimelineNavigation', () => ({
  useTimelineNavigation: () => ({
    currentTime: timelineState.currentTime,
    timeWindow: { start: null, end: null },
    isLocked: timelineState.isLocked,
    setCurrentTime: vi.fn(),
    toggleLock: vi.fn(),
    startTimeWindow: vi.fn(),
    updateTimeWindow: vi.fn(),
    endTimeWindow: vi.fn(),
    clearTimeWindow: vi.fn(),
    resetTimeline: vi.fn(),
    softReset: vi.fn(),
    syncFromScope: vi.fn(),
  }),
}));

describe('APInsightsFullScreen', () => {
  const mockOnClose = vi.fn();
  const mockSerialNumber = 'AP5020-PVT-01';
  const mockApName = 'Test AP';

  beforeEach(() => {
    vi.clearAllMocks();
    timelineState.currentTime = null;
    timelineState.isLocked = false;
    vi.mocked(apiService.apiService.getAccessPointDetails).mockResolvedValue(AP5020_DETAILS);
  });

  it('should show loading spinner initially', () => {
    vi.mocked(apiService.apiService.getAccessPointInsights).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    render(
      <APInsightsFullScreen
        serialNumber={mockSerialNumber}
        apName={mockApName}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText('Loading AP insights...')).toBeInTheDocument();
  });

  it('should display error message when API call fails', async () => {
    const errorMessage = 'Network error: Failed to connect';
    vi.mocked(apiService.apiService.getAccessPointInsights).mockRejectedValue(
      new Error(errorMessage)
    );

    render(
      <APInsightsFullScreen
        serialNumber={mockSerialNumber}
        apName={mockApName}
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Error Loading Insights')).toBeInTheDocument();
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  it('should show "Try Again" button when error occurs', async () => {
    vi.mocked(apiService.apiService.getAccessPointInsights).mockRejectedValue(
      new Error('API Error')
    );

    render(
      <APInsightsFullScreen
        serialNumber={mockSerialNumber}
        apName={mockApName}
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });
  });

  it('should display no-data message when API returns empty response', async () => {
    vi.mocked(apiService.apiService.getAccessPointInsights).mockResolvedValue({
      deviceSerialNo: mockSerialNumber,
      timeStamp: Date.now(),
      macAddress: '00:11:22:33:44:55',
      hwType: 'AP5020',
      location: 'Test',
      ipAddress: '192.168.1.100',
      swVersion: '1.0.0',
      sysUptime: 100000,
      // No reports - empty response
    });

    render(
      <APInsightsFullScreen
        serialNumber={mockSerialNumber}
        apName={mockApName}
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('No Insights Data Available')).toBeInTheDocument();
      expect(
        screen.getByText(/No performance data is available for this access point/)
      ).toBeInTheDocument();
    });
  });

  it('should show refresh button for no-data state', async () => {
    vi.mocked(apiService.apiService.getAccessPointInsights).mockResolvedValue({
      deviceSerialNo: mockSerialNumber,
      timeStamp: Date.now(),
      macAddress: '00:11:22:33:44:55',
      hwType: 'AP5020',
      location: 'Test',
      ipAddress: '192.168.1.100',
      swVersion: '1.0.0',
      sysUptime: 100000,
    });

    render(
      <APInsightsFullScreen
        serialNumber={mockSerialNumber}
        apName={mockApName}
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      const refreshButtons = screen.getAllByText('Refresh');
      expect(refreshButtons.length).toBeGreaterThan(0);
    });
  });

  it('should retry fetch when "Try Again" button is clicked', async () => {
    const mockGetInsights = vi.mocked(apiService.apiService.getAccessPointInsights);

    // First call fails, second succeeds
    mockGetInsights
      .mockRejectedValueOnce(new Error('First attempt failed'))
      .mockResolvedValueOnce({
        deviceSerialNo: mockSerialNumber,
        timeStamp: Date.now(),
        macAddress: '00:11:22:33:44:55',
        hwType: 'AP5020',
        location: 'Test',
        ipAddress: '192.168.1.100',
        swVersion: '1.0.0',
        sysUptime: 100000,
      });

    render(
      <APInsightsFullScreen
        serialNumber={mockSerialNumber}
        apName={mockApName}
        onClose={mockOnClose}
      />
    );

    // Wait for error state
    await waitFor(() => {
      expect(screen.getByText('Error Loading Insights')).toBeInTheDocument();
    });

    // Click "Try Again"
    const tryAgainButton = screen.getByText('Try Again');
    fireEvent.click(tryAgainButton);

    // The component should retry and succeed this time
    await waitFor(() => {
      expect(mockGetInsights).toHaveBeenCalledTimes(2);
    });
  });

  describe('correlation strip', () => {
    beforeEach(() => {
      vi.mocked(apiService.apiService.getAccessPointInsights).mockResolvedValue(
        AP5020_INSIGHTS_3H
      );
    });

    const renderFullScreen = () =>
      render(
        <APInsightsFullScreen
          serialNumber={mockSerialNumber}
          apName={mockApName}
          onClose={mockOnClose}
        />
      );

    it('stays hidden until a chart has been hovered or locked', async () => {
      renderFullScreen();
      await waitFor(() => {
        expect(screen.getByText('Power Consumption')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('correlation-strip')).not.toBeInTheDocument();
    });

    it('correlates every series at the locked instant', async () => {
      timelineState.isLocked = true;
      timelineState.currentTime = SPIKE_TIMESTAMP;
      renderFullScreen();

      const strip = await screen.findByTestId('correlation-strip');
      // Values from the fixture at the spike: throughput Total 4,831,190 bps
      // and the 18670 mW spike rendered as watts.
      expect(strip).toHaveTextContent('Throughput');
      expect(strip).toHaveTextContent('4.8 Mbps');
      expect(strip).toHaveTextContent('Power');
      expect(strip).toHaveTextContent('18.67 W');
      expect(strip).toHaveTextContent('Clients');
      expect(strip).toHaveTextContent('RSS');
    });

    it('tracks the hover cursor while unlocked and offers the lock hint', async () => {
      timelineState.isLocked = false;
      timelineState.currentTime = SPIKE_TIMESTAMP;
      renderFullScreen();

      const strip = await screen.findByTestId('correlation-strip');
      expect(strip).toHaveTextContent('Click a chart to lock this moment');
    });
  });

  describe('power context card', () => {
    beforeEach(() => {
      vi.mocked(apiService.apiService.getAccessPointInsights).mockResolvedValue(
        AP5020_INSIGHTS_3H
      );
    });

    const renderFullScreen = () =>
      render(
        <APInsightsFullScreen
          serialNumber={mockSerialNumber}
          apName={mockApName}
          onClose={mockOnClose}
        />
      );

    it('stays hidden while the timeline is unlocked', async () => {
      renderFullScreen();

      await waitFor(() => {
        expect(screen.getByText('Power Consumption')).toBeInTheDocument();
      });
      expect(screen.queryByText(/Power at /)).not.toBeInTheDocument();
    });

    it('shows the measured spike in watts once locked', async () => {
      timelineState.isLocked = true;
      timelineState.currentTime = SPIKE_TIMESTAMP;
      renderFullScreen();

      await waitFor(() => {
        expect(screen.getByText(/^Power at /)).toBeInTheDocument();
      });

      // 18670 mW rendered as watts, never as "18670 W". The value appears in the
      // card header, the measured-power list, and the chart's locked badge.
      expect(screen.getAllByText('18.67 W').length).toBeGreaterThan(0);
      expect(screen.queryByText(/18670/)).not.toBeInTheDocument();
    });

    it('states plainly that the spike is unexplained', async () => {
      timelineState.isLocked = true;
      timelineState.currentTime = SPIKE_TIMESTAMP;
      renderFullScreen();

      await waitFor(() => {
        expect(screen.getByText('Unexplained.')).toBeInTheDocument();
      });
      expect(screen.getByText(/no per-radio tx power/)).toBeInTheDocument();
    });

    it('lists the config levers read from the AP', async () => {
      timelineState.isLocked = true;
      timelineState.currentTime = SPIKE_TIMESTAMP;
      renderFullScreen();

      await waitFor(() => {
        expect(screen.getByText('Power levers')).toBeInTheDocument();
      });

      expect(screen.getByText('5 GHz channel width')).toBeInTheDocument();
      expect(screen.getByText(/Already optimal:/)).toBeInTheDocument();
      expect(screen.getByText(/Savings are unverified/)).toBeInTheDocument();
    });

    it('degrades the levers column when the AP config read fails', async () => {
      vi.mocked(apiService.apiService.getAccessPointDetails).mockRejectedValue(
        new Error('config unavailable')
      );
      timelineState.isLocked = true;
      timelineState.currentTime = SPIKE_TIMESTAMP;
      renderFullScreen();

      // Power analysis still renders — only the levers column is affected.
      await waitFor(() => {
        expect(screen.getByText(/AP configuration unavailable/)).toBeInTheDocument();
      });
      expect(screen.getAllByText('18.67 W').length).toBeGreaterThan(0);
    });
  });
});
