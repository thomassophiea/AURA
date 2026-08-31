/**
 * Location tab field mapping — the golden SITE_TABS "Location" fields bind
 * the REAL record paths: treeNode.mapCoordinates / treeNode.typeOfPlace,
 * afcUpdate.hour/minute and the apRanging boolean; Country/Timezone read the
 * flat identity keys.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { SiteConfig } from '../../../types/configure';
import type { SiteRefs } from './useSiteRefs';
import { SiteLocationTab } from './SiteLocationTab';

const refs: SiteRefs = { profiles: [], rfPolicies: [], aaaPolicies: [], loading: false };

const site = {
  id: 'site-1',
  siteName: 'AFC LAB',
  country: 'UNITED_STATES',
  timezone: 'America/New_York',
  siteManagerName: 'Pat Ops',
  siteManagerEmail: 'pat@example.com',
  postalCode: '03079',
  distributed: false,
  apRanging: false,
  afcUpdate: { hour: 3, minute: 30 },
  treeNode: {
    typeOfPlace: 'Campus',
    region: 'NH',
    city: 'Salem',
    campus: 'Main',
    mapCoordinates: '-81.0975232,28.6097408',
  },
} as unknown as SiteConfig;

function renderTab(over: Partial<SiteConfig> = {}, errs: Record<string, string> = {}) {
  const update = vi.fn();
  render(
    <SiteLocationTab
      form={{ ...site, ...over } as SiteConfig}
      update={update}
      errs={errs}
      isNew={false}
      refs={refs}
    />
  );
  return update;
}

describe('SiteLocationTab field mapping', () => {
  it('binds map coordinates to treeNode.mapCoordinates', () => {
    const update = renderTab();
    const input = screen.getByPlaceholderText('37.40, -121.95');
    expect(input).toHaveValue('-81.0975232,28.6097408');
    fireEvent.change(input, { target: { value: '37.40, -121.95' } });
    expect(update).toHaveBeenCalledWith('treeNode.mapCoordinates', '37.40, -121.95');
  });

  it('binds the AFC schedule to afcUpdate.hour / afcUpdate.minute', () => {
    const update = renderTab();
    const hour = screen.getByLabelText('AFC update hour');
    const minute = screen.getByLabelText('AFC update minute');
    expect(hour).toHaveValue(3);
    expect(minute).toHaveValue(30);
    fireEvent.change(hour, { target: { value: '7' } });
    expect(update).toHaveBeenCalledWith('afcUpdate.hour', 7);
    fireEvent.change(minute, { target: { value: '45' } });
    expect(update).toHaveBeenCalledWith('afcUpdate.minute', 45);
  });

  it('binds 802.11mc FTM ranging to the apRanging boolean', () => {
    const update = renderTab();
    const toggle = screen.getByRole('switch', { name: 'FTM AP to AP Ranging' });
    expect(toggle).toHaveAttribute('data-state', 'unchecked');
    fireEvent.click(toggle);
    expect(update).toHaveBeenCalledWith('apRanging', true);
  });

  it('renders Country/Timezone from the identity keys and the coord error', () => {
    renderTab({}, { coord: 'Enter a valid "latitude, longitude" (e.g. 37.40, -121.95)' });
    // Radix Select renders the selected option label in the trigger.
    expect(screen.getByLabelText('Timezone')).toHaveTextContent('America/New York');
    expect(
      screen.getByText('Enter a valid "latitude, longitude" (e.g. 37.40, -121.95)')
    ).toBeInTheDocument();
  });

  it('shows the type-of-place value without coercing an unset value', () => {
    renderTab({ treeNode: { ...site.treeNode, typeOfPlace: null } } as Partial<SiteConfig>);
    expect(screen.getByLabelText('Type of Place')).toHaveTextContent('— Select —');
  });
});
