import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DeploymentModeSelector } from './DeploymentModeSelector';

const baseProps = {
  siteName: 'HQ',
  siteId: 'sg-1',
  profileCount: 4,
  selectedMode: 'ALL_PROFILES_AT_SITE' as const,
  onModeChange: vi.fn(),
};

describe('DeploymentModeSelector', () => {
  it('renders the site name and profile count', () => {
    render(<DeploymentModeSelector {...baseProps} />);
    expect(screen.getByText('HQ')).toBeTruthy();
    expect(screen.getByText('4 profiles available')).toBeTruthy();
  });

  it('uses singular "profile" when count is 1', () => {
    render(<DeploymentModeSelector {...baseProps} profileCount={1} />);
    expect(screen.getByText('1 profile available')).toBeTruthy();
  });

  it('shows all three radio mode labels', () => {
    render(<DeploymentModeSelector {...baseProps} />);
    expect(screen.getByText('All Profiles at Site')).toBeTruthy();
    expect(screen.getByText('Specific Profiles Only')).toBeTruthy();
    expect(screen.getByText('All Except Selected')).toBeTruthy();
  });

  it('shows the "All" badge for ALL_PROFILES_AT_SITE mode', () => {
    render(<DeploymentModeSelector {...baseProps} selectedMode="ALL_PROFILES_AT_SITE" />);
    expect(screen.getByText('All')).toBeTruthy();
  });

  it('shows the selected-count badge for INCLUDE_ONLY mode', () => {
    render(
      <DeploymentModeSelector
        {...baseProps}
        selectedMode="INCLUDE_ONLY"
        selectedProfilesCount={2}
      />
    );
    expect(screen.getByText('2 selected')).toBeTruthy();
  });

  it('shows the excluded-count badge for EXCLUDE_SOME mode', () => {
    render(
      <DeploymentModeSelector
        {...baseProps}
        selectedMode="EXCLUDE_SOME"
        excludedProfilesCount={1}
      />
    );
    expect(screen.getByText('1 excluded')).toBeTruthy();
  });

  it('summary shows effective count for ALL_PROFILES_AT_SITE = profileCount', () => {
    render(<DeploymentModeSelector {...baseProps} profileCount={5} />);
    expect(screen.getByText('5 of 5')).toBeTruthy();
  });

  it('summary shows effective count for INCLUDE_ONLY = selectedProfilesCount', () => {
    render(
      <DeploymentModeSelector
        {...baseProps}
        selectedMode="INCLUDE_ONLY"
        selectedProfilesCount={2}
        profileCount={5}
      />
    );
    expect(screen.getByText('2 of 5')).toBeTruthy();
  });

  it('summary shows effective count for EXCLUDE_SOME = profileCount - excluded', () => {
    render(
      <DeploymentModeSelector
        {...baseProps}
        selectedMode="EXCLUDE_SOME"
        excludedProfilesCount={2}
        profileCount={5}
      />
    );
    expect(screen.getByText('3 of 5')).toBeTruthy();
  });

  it('Configure Profiles button only appears for INCLUDE_ONLY/EXCLUDE_SOME with onConfigureProfiles', () => {
    const onConfigure = vi.fn();
    const { rerender } = render(<DeploymentModeSelector {...baseProps} />);
    expect(screen.queryByText('Configure Profiles')).toBeNull();

    rerender(
      <DeploymentModeSelector
        {...baseProps}
        selectedMode="INCLUDE_ONLY"
        onConfigureProfiles={onConfigure}
      />
    );
    expect(screen.getByText('Configure Profiles')).toBeTruthy();
    fireEvent.click(screen.getByText('Configure Profiles'));
    expect(onConfigure).toHaveBeenCalled();
  });

  it('button label switches to "Change Selection" once configuration is done', () => {
    render(
      <DeploymentModeSelector
        {...baseProps}
        selectedMode="INCLUDE_ONLY"
        selectedProfilesCount={2}
        onConfigureProfiles={vi.fn()}
      />
    );
    expect(screen.getByText('Change Selection')).toBeTruthy();
  });
});
