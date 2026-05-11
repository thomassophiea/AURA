import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ApprovalControls } from './ApprovalControls';
import type { ExecutionPlan } from '../agentTypes';

const pendingPlan: ExecutionPlan = {
  id: 'plan-1',
  title: 'Disable SSID',
  description: 'Test plan',
  status: 'pending',
  steps: [],
  impactedObjects: [{ type: 'ssid', id: 'ssid-1', name: 'CorpNet' }],
  createdAt: new Date(),
};

describe('ApprovalControls', () => {
  it('renders Approve and Reject when plan is pending', () => {
    render(
      <ApprovalControls
        plan={pendingPlan}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onRollback={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
  });

  it('does NOT render Approve when plan is executing', () => {
    const plan = { ...pendingPlan, status: 'executing' as const };
    render(
      <ApprovalControls plan={plan} onApprove={vi.fn()} onReject={vi.fn()} onRollback={vi.fn()} />
    );
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument();
  });

  it('calls onApprove when Approve clicked', () => {
    const onApprove = vi.fn();
    render(
      <ApprovalControls
        plan={pendingPlan}
        onApprove={onApprove}
        onReject={vi.fn()}
        onRollback={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(onApprove).toHaveBeenCalledWith('plan-1');
  });

  it('calls onReject when Reject clicked', () => {
    const onReject = vi.fn();
    render(
      <ApprovalControls
        plan={pendingPlan}
        onApprove={vi.fn()}
        onReject={onReject}
        onRollback={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));
    expect(onReject).toHaveBeenCalledWith('plan-1');
  });

  it('shows Rollback only when status is completed', () => {
    const completed = { ...pendingPlan, status: 'completed' as const };
    render(
      <ApprovalControls
        plan={completed}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onRollback={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /rollback/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument();
  });

  it('renders warning text when pending', () => {
    render(
      <ApprovalControls
        plan={pendingPlan}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onRollback={vi.fn()}
      />
    );
    expect(screen.getByText(/live infrastructure/i)).toBeInTheDocument();
  });
});
