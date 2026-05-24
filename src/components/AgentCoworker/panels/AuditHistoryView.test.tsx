import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuditHistoryView } from './AuditHistoryView';
import type { AuditEntry } from '../agentTypes';

function makeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: 'audit-1',
    timestamp: new Date('2026-05-22T10:00:00Z'),
    action: 'Disable SSID Corp-WiFi',
    operator: 'admin@corp.com',
    planId: 'plan-1',
    status: 'completed',
    impactedObjects: [{ type: 'ssid', id: 'ssid-1', name: 'Corp-WiFi' }],
    ...overrides,
  };
}

describe('AuditHistoryView', () => {
  it('shows empty state when no entries', () => {
    render(<AuditHistoryView entries={[]} />);
    expect(screen.getByText('No operations recorded yet')).toBeInTheDocument();
  });

  it('renders audit entries', () => {
    render(<AuditHistoryView entries={[makeEntry()]} />);
    expect(screen.getByText('Disable SSID Corp-WiFi')).toBeInTheDocument();
    expect(screen.getByText(/admin@corp\.com/)).toBeInTheDocument();
  });

  it('expands entry on click to show planId', () => {
    render(<AuditHistoryView entries={[makeEntry()]} />);
    fireEvent.click(screen.getByText('Disable SSID Corp-WiFi'));
    expect(screen.getByText('plan-1')).toBeInTheDocument();
  });

  it('shows rollback button for completed entries when onRollback provided', () => {
    const onRollback = vi.fn();
    render(<AuditHistoryView entries={[makeEntry()]} onRollback={onRollback} />);
    fireEvent.click(screen.getByText('Disable SSID Corp-WiFi'));
    const btn = screen.getByText('Roll back');
    fireEvent.click(btn);
    expect(onRollback).toHaveBeenCalledWith('plan-1');
  });

  it('does not show rollback button for failed entries', () => {
    render(<AuditHistoryView entries={[makeEntry({ status: 'failed' })]} onRollback={vi.fn()} />);
    fireEvent.click(screen.getByText('Disable SSID Corp-WiFi'));
    expect(screen.queryByText('Roll back')).not.toBeInTheDocument();
  });

  it('renders impacted objects when expanded', () => {
    render(<AuditHistoryView entries={[makeEntry()]} />);
    fireEvent.click(screen.getByText('Disable SSID Corp-WiFi'));
    expect(screen.getByText('Corp-WiFi')).toBeInTheDocument();
  });

  it('renders multiple entries', () => {
    const entries = [
      makeEntry({ id: 'a1', action: 'Action One' }),
      makeEntry({ id: 'a2', action: 'Action Two', status: 'failed' }),
    ];
    render(<AuditHistoryView entries={entries} />);
    expect(screen.getByText('Action One')).toBeInTheDocument();
    expect(screen.getByText('Action Two')).toBeInTheDocument();
    expect(screen.getByText(/2 operations/)).toBeInTheDocument();
  });
});
