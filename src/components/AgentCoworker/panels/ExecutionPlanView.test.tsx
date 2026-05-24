import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExecutionPlanView } from './ExecutionPlanView';
import type { ExecutionPlan } from '../agentTypes';

function makePlan(overrides: Partial<ExecutionPlan> = {}): ExecutionPlan {
  return {
    id: 'plan-1',
    title: 'Disable SSID Corp-WiFi',
    description: 'Disables the Corp-WiFi SSID across all sites.',
    status: 'pending',
    steps: [
      {
        id: 's1',
        label: 'Fetch current state',
        description: 'GET /v1/services',
        status: 'completed',
      },
      { id: 's2', label: 'Apply disable', description: 'PUT /v1/services/1', status: 'pending' },
    ],
    impactedObjects: [{ type: 'ssid', id: 'ssid-1', name: 'Corp-WiFi' }],
    createdAt: new Date('2026-05-22T10:00:00Z'),
    ...overrides,
  };
}

describe('ExecutionPlanView', () => {
  it('shows empty state when plan is null', () => {
    render(<ExecutionPlanView plan={null} />);
    expect(screen.getByText('No active execution plan')).toBeInTheDocument();
  });

  it('renders plan title and status badge', () => {
    render(<ExecutionPlanView plan={makePlan()} />);
    expect(screen.getByText('Disable SSID Corp-WiFi')).toBeInTheDocument();
    expect(screen.getByText('Awaiting Approval')).toBeInTheDocument();
  });

  it('renders plan steps', () => {
    render(<ExecutionPlanView plan={makePlan()} />);
    expect(screen.getByText('Fetch current state')).toBeInTheDocument();
    expect(screen.getByText('Apply disable')).toBeInTheDocument();
  });

  it('renders impacted objects', () => {
    render(<ExecutionPlanView plan={makePlan()} />);
    expect(screen.getByText('Corp-WiFi')).toBeInTheDocument();
  });

  it('shows completedAt time when plan is completed', () => {
    const completedAt = new Date('2026-05-22T10:05:00Z');
    render(<ExecutionPlanView plan={makePlan({ status: 'completed', completedAt })} />);
    expect(screen.getAllByText(/Completed/).length).toBeGreaterThan(0);
  });

  it('renders all plan statuses without crashing', () => {
    const statuses = [
      'building',
      'approved',
      'executing',
      'completed',
      'rejected',
      'rolledback',
      'failed',
    ] as const;
    for (const status of statuses) {
      const { unmount } = render(<ExecutionPlanView plan={makePlan({ status })} />);
      unmount();
    }
  });
});
