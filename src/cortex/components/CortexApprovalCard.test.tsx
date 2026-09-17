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

const DEPLOY_EVENT = {
  emit: 'preview' as const,
  validationToken: 'tok-dep',
  preview: {
    workflowId: 'wf-9',
    intent: 'deploy Skynet to EAL-PT-N',
    diff: null,
    deployment: {
      status: 'ok',
      site: 'EAL-PT-N',
      serviceName: 'Skynet',
      blastRadius: { sites: 1, aps: 1, profiles: 1, forks: 1, radios: 2 },
      targets: [
        {
          profileName: '5022-N',
          action: 'fork' as const,
          forkName: '5022-N-EAL-PT-N',
          protectedSites: ['EAL-PT-S'],
          apNames: ['EAL-PT-N-5th'],
          radios: [{ index: 1, band: '2.4' }, { index: 2, band: '5' }],
          excluded: [{ index: 3, band: '6', reason: 'Wi-Fi 6E requires WPA3-SAE or OWE' }],
        },
      ],
      warnings: ['This WLAN will not be broadcast on 6 GHz.'],
    },
  },
};

describe('CortexApprovalCard — site deployment', () => {
  it('shows the blast radius rather than a bare confirmation', () => {
    render(<CortexApprovalCard event={DEPLOY_EVENT} onApprove={noop} onDecline={noop} />);
    // The site appears in the heading and again inside the fork name, which is
    // correct — assert presence, not uniqueness.
    expect(screen.getAllByText(/EAL-PT-N/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/5022-N/).length).toBeGreaterThan(0);
    expect(screen.getByText(/1 profile/)).toBeInTheDocument();
    expect(screen.getByText(/2 radios/)).toBeInTheDocument();
  });

  it('names the site a fork is protecting, so the reasoning is visible', () => {
    // The whole point of forking. If the operator cannot see that EAL-PT-S was
    // protected, they cannot tell this apart from a plain bind.
    render(<CortexApprovalCard event={DEPLOY_EVENT} onApprove={noop} onDecline={noop} />);
    expect(screen.getByText(/EAL-PT-S/)).toBeInTheDocument();
  });

  it('states the 6 GHz exclusion instead of leaving it silent', () => {
    render(<CortexApprovalCard event={DEPLOY_EVENT} onApprove={noop} onDecline={noop} />);
    // Stated twice on purpose: once against the radio it affects, once as a
    // warning about the WLAN as a whole.
    expect(screen.getAllByText(/6 GHz/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Radio 3 \(6 GHz\) excluded/i)).toBeInTheDocument();
  });

  it('binds approval to the deployment plan', () => {
    const onApprove = vi.fn();
    render(<CortexApprovalCard event={DEPLOY_EVENT} onApprove={onApprove} onDecline={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /deploy|apply/i }));
    expect(onApprove).toHaveBeenCalledWith('wf-9', 'tok-dep');
  });
});
