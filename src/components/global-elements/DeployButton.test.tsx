import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const deployHook = vi.hoisted(() => ({
  current: {
    deploy: vi.fn(),
    isDeploying: false,
    result: null as null | { status: 'success' | 'failed'; error_message?: string },
    error: null as string | null,
  },
}));

vi.mock('../../hooks/useDeployment', () => ({
  useDeployTemplate: () => deployHook.current,
}));

import { DeployButton } from './DeployButton';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }
});

beforeEach(() => {
  deployHook.current = {
    deploy: vi.fn(),
    isDeploying: false,
    result: null,
    error: null,
  };
});

const baseProps = {
  template: {
    id: 't-1',
    name: 'My Template',
    element_type: 'WLAN',
    org_id: 'org-1',
  } as any,
  resolved: {
    is_fully_resolved: true,
    variables: [{ name: 'x' }, { name: 'y' }],
    resolved_payload: { ssid: 'TestSSID' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any,
  definitions: [],
  values: [],
  context: { org_id: 'org-1' } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  siteGroup: {
    id: 'sg-1',
    name: 'HQ',
    controller_url: 'https://controller.local',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any,
};

describe('DeployButton', () => {
  it('renders the trigger labeled "Deploy"', () => {
    render(<DeployButton {...baseProps} />);
    expect(screen.getByText('Deploy')).toBeTruthy();
  });

  it('disables the trigger when resolved.is_fully_resolved=false', () => {
    render(
      <DeployButton {...baseProps} resolved={{ ...baseProps.resolved, is_fully_resolved: false }} />
    );
    expect((screen.getByText('Deploy').closest('button')! as HTMLButtonElement).disabled).toBe(
      true
    );
  });

  it('disables the trigger when prop.disabled=true', () => {
    render(<DeployButton {...baseProps} disabled />);
    expect((screen.getByText('Deploy').closest('button')! as HTMLButtonElement).disabled).toBe(
      true
    );
  });

  it('opens the confirmation dialog with template/site-group/variable counts', () => {
    render(<DeployButton {...baseProps} />);
    fireEvent.click(screen.getByText('Deploy'));
    expect(screen.getByText('Deploy Template')).toBeTruthy();
    expect(screen.getByText('My Template')).toBeTruthy();
    expect(screen.getByText('HQ')).toBeTruthy();
    expect(screen.getByText('2 resolved')).toBeTruthy();
    expect(screen.getByText(/TestSSID/)).toBeTruthy();
  });

  it('Confirm Deploy invokes deploy() with resolved args', () => {
    render(<DeployButton {...baseProps} />);
    fireEvent.click(screen.getByText('Deploy'));
    fireEvent.click(screen.getByText('Confirm Deploy'));
    expect(deployHook.current.deploy).toHaveBeenCalledWith(
      baseProps.template,
      baseProps.definitions,
      baseProps.values,
      baseProps.context,
      baseProps.siteGroup,
      'org-1'
    );
  });

  it('shows the deploying state when isDeploying=true', () => {
    deployHook.current.isDeploying = true;
    render(<DeployButton {...baseProps} />);
    fireEvent.click(screen.getByText('Deploy'));
    expect(screen.getByText(/Deploying.../)).toBeTruthy();
  });

  it('shows success banner when result.status=success', () => {
    deployHook.current.result = { status: 'success' };
    render(<DeployButton {...baseProps} />);
    fireEvent.click(screen.getByText('Deploy'));
    expect(screen.getByText(/Deployed successfully/i)).toBeTruthy();
    // After success, "Confirm Deploy" is replaced by a Close button
    // (along with the Radix dialog's built-in close icon "Close" sr-only label).
    expect(screen.queryByText('Confirm Deploy')).toBeNull();
    expect(screen.getAllByText('Close').length).toBeGreaterThanOrEqual(1);
  });

  it('shows the error message when result.status=failed', () => {
    deployHook.current.result = {
      status: 'failed',
      error_message: 'Controller offline',
    };
    render(<DeployButton {...baseProps} />);
    fireEvent.click(screen.getByText('Deploy'));
    expect(screen.getByText('Controller offline')).toBeTruthy();
  });

  it('falls back to "Deployment failed" when no error_message provided', () => {
    deployHook.current.result = { status: 'failed' };
    render(<DeployButton {...baseProps} />);
    fireEvent.click(screen.getByText('Deploy'));
    expect(screen.getByText('Deployment failed')).toBeTruthy();
  });
});
