import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecentEventsSummary } from './RecentEventsSummary';

describe('RecentEventsSummary', () => {
  it('renders the all-clear row when nothing is wrong', () => {
    render(<RecentEventsSummary offlineApCount={0} criticalCount={0} warningCount={0} />);
    expect(screen.getByText(/all systems operational/i)).toBeInTheDocument();
  });

  it('renders the offline-AP row when offlineApCount > 0', () => {
    render(<RecentEventsSummary offlineApCount={3} criticalCount={0} warningCount={0} />);
    expect(screen.getByText('APs Offline')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryByText(/all systems operational/i)).not.toBeInTheDocument();
  });

  it('renders the critical alerts row', () => {
    render(<RecentEventsSummary offlineApCount={0} criticalCount={2} warningCount={0} />);
    expect(screen.getByText('Critical Alerts')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders the warnings row', () => {
    render(<RecentEventsSummary offlineApCount={0} criticalCount={0} warningCount={5} />);
    expect(screen.getByText('Warnings')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders all three rows when all categories non-zero', () => {
    render(<RecentEventsSummary offlineApCount={1} criticalCount={2} warningCount={3} />);
    expect(screen.getByText('APs Offline')).toBeInTheDocument();
    expect(screen.getByText('Critical Alerts')).toBeInTheDocument();
    expect(screen.getByText('Warnings')).toBeInTheDocument();
    expect(screen.queryByText(/all systems operational/i)).not.toBeInTheDocument();
  });

  it('renders the "Last 24h" label in the header', () => {
    render(<RecentEventsSummary offlineApCount={0} criticalCount={0} warningCount={0} />);
    expect(screen.getByText('Last 24h')).toBeInTheDocument();
  });
});
