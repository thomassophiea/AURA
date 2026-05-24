import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigDiffView } from './ConfigDiffView';
import type { DiffEntry } from '../agentTypes';

const entries: DiffEntry[] = [
  { field: 'enabled', scope: 'Corp-WiFi @ site-1', before: true, after: false },
  { field: 'vlan', scope: 'Corp-WiFi @ site-1', before: 10, after: 20 },
  { field: 'security', scope: 'Corp-WiFi @ site-1', before: null, after: 'WPA3' },
];

describe('ConfigDiffView', () => {
  it('shows empty state when diff is empty', () => {
    render(<ConfigDiffView diff={[]} />);
    expect(screen.getByText('No config changes staged')).toBeInTheDocument();
  });

  it('renders field names', () => {
    render(<ConfigDiffView diff={entries} />);
    expect(screen.getByText('enabled')).toBeInTheDocument();
    expect(screen.getByText('vlan')).toBeInTheDocument();
    expect(screen.getByText('security')).toBeInTheDocument();
  });

  it('renders before and after values', () => {
    render(<ConfigDiffView diff={entries} />);
    expect(screen.getByText('true')).toBeInTheDocument();
    expect(screen.getByText('false')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
  });

  it('renders null before value as em-dash', () => {
    render(<ConfigDiffView diff={entries} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('shows count in header', () => {
    render(<ConfigDiffView diff={entries} />);
    expect(screen.getByText(/3 fields/)).toBeInTheDocument();
  });

  it('uses singular "field" for one entry', () => {
    render(<ConfigDiffView diff={[entries[0]]} />);
    expect(screen.getByText(/Staged Changes/)).toBeInTheDocument();
    expect(screen.queryByText(/fields/)).not.toBeInTheDocument();
  });
});
