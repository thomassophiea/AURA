import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CortexApprovalCard } from './CortexApprovalCard';

const EVENT = {
  emit: 'preview' as const,
  validationToken: 'tok-abc',
  preview: {
    workflowId: 'wf-1',
    intent: 'enable 802.11k on Skynet',
    diff: {
      path: 'enabled11kSupport',
      label: '802.11k neighbour reports',
      from: false,
      to: true,
      risk: 'low',
      rationale: 'Lets clients discover neighbouring APs.',
      postCondition:
        'After applying I will re-read the service and confirm enabled11kSupport is true.',
    },
  },
};

const noop = () => {};

describe('CortexApprovalCard', () => {
  it('shows the field and both values, not a summary', () => {
    render(<CortexApprovalCard event={EVENT} onApprove={noop} onDecline={noop} />);

    expect(screen.getByText('enabled11kSupport')).toBeInTheDocument();
    expect(screen.getByText('false')).toBeInTheDocument();
    expect(screen.getByText('true')).toBeInTheDocument();
  });

  it('shows what will be checked after applying', () => {
    // The operator should know what would count as failure before it runs.
    render(<CortexApprovalCard event={EVENT} onApprove={noop} onDecline={noop} />);
    expect(screen.getByText(/re-read the service/i)).toBeInTheDocument();
  });

  it('binds approval to the previewed plan', () => {
    const onApprove = vi.fn();
    render(<CortexApprovalCard event={EVENT} onApprove={onApprove} onDecline={noop} />);

    fireEvent.click(screen.getByRole('button', { name: /apply this change/i }));
    expect(onApprove).toHaveBeenCalledWith('wf-1', 'tok-abc');
  });

  it('declines without applying', () => {
    const onDecline = vi.fn();
    const onApprove = vi.fn();
    render(<CortexApprovalCard event={EVENT} onApprove={onApprove} onDecline={onDecline} />);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onDecline).toHaveBeenCalledWith('wf-1');
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('flags a medium-risk change rather than burying it', () => {
    const medium = {
      ...EVENT,
      preview: { ...EVENT.preview, diff: { ...EVENT.preview.diff, risk: 'medium' } },
    };
    render(<CortexApprovalCard event={medium} onApprove={noop} onDecline={noop} />);
    expect(screen.getByText(/medium risk/i)).toBeInTheDocument();
  });

  it('renders nothing for a non-preview event', () => {
    const { container } = render(
      <CortexApprovalCard
        event={{ ...EVENT, emit: 'question' }}
        onApprove={noop}
        onDecline={noop}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a preview that carries no diff', () => {
    // A create_wlan preview has fields, not a diff. It must not render an
    // empty approval card that looks like a change with nothing in it.
    const { container } = render(
      <CortexApprovalCard
        event={{ ...EVENT, preview: { workflowId: 'wf-1', intent: 'create a wlan', diff: null } }}
        onApprove={noop}
        onDecline={noop}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('disables both buttons once a decision has been taken', () => {
    // Double-applying a config change is a second write to a live network.
    render(<CortexApprovalCard event={EVENT} onApprove={noop} onDecline={noop} decided />);

    expect(screen.getByRole('button', { name: /apply this change/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
  });
});
