import { describe, it, expect, vi, beforeEach } from 'vitest';
// fireEvent rather than @testing-library/user-event: user-event is not a dependency of
// this project, and a plain click needs no simulated pointer sequence.
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { APInsightsFullScreen } from './APInsights';
import * as apiService from '../services/api';

// Mock the API service
vi.mock('../services/api', () => ({
  apiService: {
    getAccessPointInsights: vi.fn(),
  },
}));

// Mock the hooks
vi.mock('../hooks/useTimelineNavigation', () => ({
  useTimelineNavigation: () => ({
    currentTime: null,
    timeWindow: { start: null, end: null },
    isLocked: false,
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
});
