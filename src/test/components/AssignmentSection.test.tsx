import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AssignmentSection } from '../../components/AssignmentSection';
import type { WLANAssignmentMode } from '../../types/network';
import type { Site } from '../../types/network';
import type { SiteGroup } from '../../types/domain';

const mockSites: Site[] = [
  { id: 'site-1', name: 'NYC-HQ' },
  { id: 'site-2', name: 'Boston-01' },
];
const mockSiteGroups: SiteGroup[] = [
  {
    id: 'sg-1',
    name: 'East Coast',
    org_id: 'org-1',
    controller_url: 'https://ctrl1',
    connection_status: 'connected',
    is_default: false,
  },
];

function renderSection(
  value: WLANAssignmentMode = 'all_sites',
  overrides: Partial<React.ComponentProps<typeof AssignmentSection>> = {}
) {
  const onChange = vi.fn();
  const onSitesChange = vi.fn();
  const onSiteGroupsChange = vi.fn();
  render(
    <AssignmentSection
      value={value}
      onChange={onChange}
      selectedSiteIds={[]}
      selectedSiteGroupIds={[]}
      onSitesChange={onSitesChange}
      onSiteGroupsChange={onSiteGroupsChange}
      sites={mockSites}
      siteGroups={mockSiteGroups}
      {...overrides}
    />
  );
  return { onChange, onSitesChange, onSiteGroupsChange };
}

describe('AssignmentSection', () => {
  it('renders all three radio options', () => {
    renderSection();
    expect(screen.getByText('Not assigned')).toBeInTheDocument();
    expect(screen.getByText('All sites')).toBeInTheDocument();
    expect(screen.getByText('Select sites / site groups')).toBeInTheDocument();
  });

  it('calls onChange when a different radio option is clicked', () => {
    const { onChange } = renderSection('all_sites');
    fireEvent.click(screen.getByText('Not assigned'));
    expect(onChange).toHaveBeenCalledWith('unassigned');
  });

  it('does not show chip picker when mode is all_sites', () => {
    renderSection('all_sites');
    expect(screen.queryByPlaceholderText(/search sites/i)).not.toBeInTheDocument();
  });

  it('shows chip picker when mode is selected_targets', () => {
    renderSection('selected_targets');
    expect(screen.getByPlaceholderText(/search sites/i)).toBeInTheDocument();
  });

  it('renders selected site as a removable chip', () => {
    renderSection('selected_targets', { selectedSiteIds: ['site-1'] });
    expect(screen.getByText('NYC-HQ')).toBeInTheDocument();
    expect(screen.getByLabelText('Remove NYC-HQ')).toBeInTheDocument();
  });

  it('calls onSitesChange without the removed id when chip X is clicked', () => {
    const { onSitesChange } = renderSection('selected_targets', {
      selectedSiteIds: ['site-1', 'site-2'],
    });
    fireEvent.click(screen.getByLabelText('Remove NYC-HQ'));
    expect(onSitesChange).toHaveBeenCalledWith(['site-2']);
  });

  it('shows validation hint when selected_targets but nothing selected', () => {
    renderSection('selected_targets', {
      selectedSiteIds: [],
      selectedSiteGroupIds: [],
    });
    expect(screen.getByText(/select at least one target/i)).toBeInTheDocument();
  });

  it('does not show validation hint when selected_targets has selections', () => {
    renderSection('selected_targets', { selectedSiteIds: ['site-1'] });
    expect(screen.queryByText(/select at least one target/i)).not.toBeInTheDocument();
  });
});
