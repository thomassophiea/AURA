import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { APITimelineView } from './APITimelineView';
import type { APITimelineEntry } from '../agentTypes';

function makeEntry(overrides: Partial<APITimelineEntry> = {}): APITimelineEntry {
  return {
    id: 'e1',
    timestamp: new Date('2026-05-22T10:00:00Z'),
    method: 'GET',
    endpoint: '/v1/state/sites',
    status: 200,
    duration: 42,
    ...overrides,
  };
}

describe('APITimelineView', () => {
  it('shows empty state when no entries', () => {
    render(<APITimelineView entries={[]} />);
    expect(screen.getByText('No API calls yet')).toBeInTheDocument();
  });

  it('renders method, endpoint, status, and duration', () => {
    render(<APITimelineView entries={[makeEntry()]} />);
    expect(screen.getByText('GET')).toBeInTheDocument();
    expect(screen.getByText('/v1/state/sites')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('42ms')).toBeInTheDocument();
  });

  it('renders all HTTP methods', () => {
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
    const entries = methods.map((method, i) =>
      makeEntry({ id: `e${i}`, method, endpoint: `/${method.toLowerCase()}` })
    );
    render(<APITimelineView entries={entries} />);
    methods.forEach((m) => expect(screen.getByText(m)).toBeInTheDocument());
  });

  it('shows entry count in header', () => {
    render(<APITimelineView entries={[makeEntry(), makeEntry({ id: 'e2' })]} />);
    expect(screen.getByText(/2 calls/)).toBeInTheDocument();
  });

  it('renders 4xx status with amber color class', () => {
    render(<APITimelineView entries={[makeEntry({ status: 404 })]} />);
    const statusEl = screen.getByText('404');
    expect(statusEl.className).toContain('amber');
  });

  it('renders 5xx status with red color class', () => {
    render(<APITimelineView entries={[makeEntry({ status: 500 })]} />);
    const statusEl = screen.getByText('500');
    expect(statusEl.className).toContain('red');
  });
});
