import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PerformanceSection } from './PerformanceSection';

const baseMetrics = {
  avgRssi: -55,
  avgSnr: 32,
  authenticatedRate: 99.2,
  apUptime: 99.5,
  channelUtil: 25,
  rfqi: 85,
  totalThroughputMbps: 250,
};

const baseAp = {
  total: 10,
  online: 9,
  offline: 1,
  primary: 6,
  backup: 3,
  standby: 1,
  lowPower: 0,
  normalPower: 10,
};

const baseClient = {
  total: 50,
  throughputUpload: 5_000_000,
  throughputDownload: 20_000_000,
};

const colors = ['#a', '#b', '#c'];

const baseRadar = [
  { metric: 'RSSI', value: 80, fullMark: 100 },
  { metric: 'SNR', value: 70, fullMark: 100 },
];

describe('PerformanceSection — header', () => {
  it('renders the title and description', () => {
    render(
      <PerformanceSection
        performanceMetrics={baseMetrics}
        radarData={baseRadar}
        apStats={baseAp}
        clientStats={baseClient}
        clientDistribution={[]}
        colors={colors}
        onServiceClick={() => {}}
      />
    );
    expect(screen.getByText('Performance and Quality')).toBeInTheDocument();
    expect(screen.getByText(/distribution analytics/i)).toBeInTheDocument();
  });
});

describe('PerformanceSection — metric thresholds', () => {
  it('renders RSSI in dBm with correct rounding', () => {
    render(
      <PerformanceSection
        performanceMetrics={{ ...baseMetrics, avgRssi: -55.7 }}
        radarData={baseRadar}
        apStats={baseAp}
        clientStats={baseClient}
        clientDistribution={[]}
        colors={colors}
        onServiceClick={() => {}}
      />
    );
    expect(screen.getByText('-56 dBm')).toBeInTheDocument();
  });

  it('renders the "Excellent signal" insight when RSSI ≥ -50', () => {
    render(
      <PerformanceSection
        performanceMetrics={{ ...baseMetrics, avgRssi: -45 }}
        radarData={baseRadar}
        apStats={baseAp}
        clientStats={baseClient}
        clientDistribution={[]}
        colors={colors}
        onServiceClick={() => {}}
      />
    );
    expect(screen.getByText(/Excellent signal/)).toBeInTheDocument();
  });

  it('renders "Good signal" insight when -60 ≤ RSSI < -50', () => {
    render(
      <PerformanceSection
        performanceMetrics={{ ...baseMetrics, avgRssi: -55 }}
        radarData={baseRadar}
        apStats={baseAp}
        clientStats={baseClient}
        clientDistribution={[]}
        colors={colors}
        onServiceClick={() => {}}
      />
    );
    expect(screen.getByText(/Good signal/)).toBeInTheDocument();
  });

  it('renders "Weak signal" insight when RSSI < -70', () => {
    render(
      <PerformanceSection
        performanceMetrics={{ ...baseMetrics, avgRssi: -78 }}
        radarData={baseRadar}
        apStats={baseAp}
        clientStats={baseClient}
        clientDistribution={[]}
        colors={colors}
        onServiceClick={() => {}}
      />
    );
    expect(screen.getByText(/Weak signal/)).toBeInTheDocument();
  });

  it('hides the Channel Util section when channelUtil is 0', () => {
    render(
      <PerformanceSection
        performanceMetrics={{ ...baseMetrics, channelUtil: 0 }}
        radarData={baseRadar}
        apStats={baseAp}
        clientStats={baseClient}
        clientDistribution={[]}
        colors={colors}
        onServiceClick={() => {}}
      />
    );
    expect(screen.queryByText('Channel Utilization')).not.toBeInTheDocument();
  });

  it('hides the RFQI section when rfqi is 0', () => {
    render(
      <PerformanceSection
        performanceMetrics={{ ...baseMetrics, rfqi: 0 }}
        radarData={baseRadar}
        apStats={baseAp}
        clientStats={baseClient}
        clientDistribution={[]}
        colors={colors}
        onServiceClick={() => {}}
      />
    );
    expect(screen.queryByText('RF Quality Index')).not.toBeInTheDocument();
  });

  it('hides the Throughput row when totalThroughputMbps is 0', () => {
    render(
      <PerformanceSection
        performanceMetrics={{ ...baseMetrics, totalThroughputMbps: 0 }}
        radarData={baseRadar}
        apStats={baseAp}
        clientStats={baseClient}
        clientDistribution={[]}
        colors={colors}
        onServiceClick={() => {}}
      />
    );
    expect(screen.queryByRole('heading', { name: 'Network Throughput' })).not.toBeInTheDocument();
  });

  it('formats throughput as Gbps when ≥ 1000 Mbps', () => {
    render(
      <PerformanceSection
        performanceMetrics={{ ...baseMetrics, totalThroughputMbps: 2_500 }}
        radarData={baseRadar}
        apStats={baseAp}
        clientStats={baseClient}
        clientDistribution={[]}
        colors={colors}
        onServiceClick={() => {}}
      />
    );
    expect(screen.getByText('2.50 Gbps')).toBeInTheDocument();
  });
});

describe('PerformanceSection — null performanceMetrics', () => {
  it('renders without crashing and skips per-metric rows', () => {
    render(
      <PerformanceSection
        performanceMetrics={null}
        radarData={[]}
        apStats={baseAp}
        clientStats={baseClient}
        clientDistribution={[]}
        colors={colors}
        onServiceClick={() => {}}
      />
    );
    expect(screen.queryByText('Signal Strength (RSSI)')).not.toBeInTheDocument();
    expect(screen.queryByText('Signal Quality (SNR)')).not.toBeInTheDocument();
  });
});

describe('PerformanceSection — radar chart', () => {
  it('renders the empty-state when radarData is empty', () => {
    render(
      <PerformanceSection
        performanceMetrics={baseMetrics}
        radarData={[]}
        apStats={baseAp}
        clientStats={baseClient}
        clientDistribution={[]}
        colors={colors}
        onServiceClick={() => {}}
      />
    );
    expect(screen.getByText('No metrics available')).toBeInTheDocument();
  });
});

describe('PerformanceSection — AP distribution', () => {
  it('shows primary/backup/standby with their counts and percents', () => {
    render(
      <PerformanceSection
        performanceMetrics={baseMetrics}
        radarData={baseRadar}
        apStats={{ ...baseAp, primary: 6, backup: 3, standby: 1, total: 10 }}
        clientStats={baseClient}
        clientDistribution={[]}
        colors={colors}
        onServiceClick={() => {}}
      />
    );
    expect(screen.getByText(/6 \(60%\)/)).toBeInTheDocument();
    expect(screen.getByText(/3 \(30%\)/)).toBeInTheDocument();
    expect(screen.getByText(/1 \(10%\)/)).toBeInTheDocument();
  });

  it('shows the Normal Power and Low Power rows', () => {
    render(
      <PerformanceSection
        performanceMetrics={baseMetrics}
        radarData={baseRadar}
        apStats={{ ...baseAp, normalPower: 8, lowPower: 2, total: 10 }}
        clientStats={baseClient}
        clientDistribution={[]}
        colors={colors}
        onServiceClick={() => {}}
      />
    );
    expect(screen.getByText('Normal Power')).toBeInTheDocument();
    expect(screen.getByText(/8 \(80%\)/)).toBeInTheDocument();
    expect(screen.getByText('Low Power')).toBeInTheDocument();
    expect(screen.getByText(/2 \(20%\)/)).toBeInTheDocument();
  });
});

describe('PerformanceSection — Client distribution', () => {
  it('shows the "No clients connected" state when clientStats.total is 0', () => {
    render(
      <PerformanceSection
        performanceMetrics={baseMetrics}
        radarData={baseRadar}
        apStats={baseAp}
        clientStats={{ ...baseClient, total: 0 }}
        clientDistribution={[]}
        colors={colors}
        onServiceClick={() => {}}
      />
    );
    expect(screen.getByText('No clients connected')).toBeInTheDocument();
  });

  it('shows the "Unable to load" state when clients connected but distribution empty', () => {
    render(
      <PerformanceSection
        performanceMetrics={baseMetrics}
        radarData={baseRadar}
        apStats={baseAp}
        clientStats={{ ...baseClient, total: 50 }}
        clientDistribution={[]}
        colors={colors}
        onServiceClick={() => {}}
      />
    );
    expect(screen.getByText(/Unable to load client distribution/)).toBeInTheDocument();
  });

  it('renders distribution items and fires onServiceClick on row click', () => {
    const onClick = vi.fn();
    render(
      <PerformanceSection
        performanceMetrics={baseMetrics}
        radarData={baseRadar}
        apStats={baseAp}
        clientStats={baseClient}
        clientDistribution={[
          { service: 'Voice WLAN', count: 20, percentage: 40 },
          { service: 'Guest WLAN', count: 10, percentage: 20 },
        ]}
        colors={colors}
        onServiceClick={onClick}
      />
    );
    fireEvent.click(screen.getByText('Voice WLAN'));
    expect(onClick).toHaveBeenCalledWith('Voice WLAN');
  });
});
