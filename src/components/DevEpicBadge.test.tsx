import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DevEpicBadge } from './DevEpicBadge';

describe('DevEpicBadge', () => {
  it('renders epic key and title when show=true', () => {
    render(
      <DevEpicBadge
        epicKey="NVO-7242"
        epicTitle="WLAN Configuration"
        jiraUrl="https://extremenetworks.atlassian.net/browse/NVO-7242"
        show={true}
      />
    );
    expect(screen.getByText('NVO-7242')).toBeInTheDocument();
    expect(screen.getByText('WLAN Configuration')).toBeInTheDocument();
  });

  it('links to the correct Jira URL', () => {
    render(
      <DevEpicBadge
        epicKey="NVO-7242"
        epicTitle="WLAN Configuration"
        jiraUrl="https://extremenetworks.atlassian.net/browse/NVO-7242"
        show={true}
      />
    );
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      'https://extremenetworks.atlassian.net/browse/NVO-7242'
    );
  });

  it('opens in new tab', () => {
    render(
      <DevEpicBadge
        epicKey="NVO-7242"
        epicTitle="WLAN Configuration"
        jiraUrl="https://extremenetworks.atlassian.net/browse/NVO-7242"
        show={true}
      />
    );
    expect(screen.getByRole('link')).toHaveAttribute('target', '_blank');
  });

  it('renders nothing when show=false', () => {
    const { container } = render(
      <DevEpicBadge
        epicKey="NVO-7242"
        epicTitle="WLAN Configuration"
        jiraUrl="https://extremenetworks.atlassian.net/browse/NVO-7242"
        show={false}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
