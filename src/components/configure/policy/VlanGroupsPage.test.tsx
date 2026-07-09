/**
 * VlanGroupsPage support gating: the vlangroups endpoints are optional
 * (the lab controller 404s them), so the page must probe isSupported() and
 * render an informative unsupported state instead of an empty grid.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const isSupported = vi.fn();
const list = vi.fn();

vi.mock('../../../services/configure', () => ({
  vlanGroupsService: {
    isSupported: (...args: unknown[]) => isSupported(...args),
    list: (...args: unknown[]) => list(...args),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
  topologiesService: { list: vi.fn().mockResolvedValue([]) },
  cosService: { list: vi.fn().mockResolvedValue([]) },
  rateLimitersService: { list: vi.fn().mockResolvedValue([]) },
  ConfigureApiError: class ConfigureApiError extends Error {},
}));

import { VlanGroupsPage } from './VlanGroupsPage';

describe('VlanGroupsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the unsupported state when both endpoints 404', async () => {
    isSupported.mockResolvedValue(false);
    render(<VlanGroupsPage />);
    await waitFor(() =>
      expect(
        screen.getByText('VLAN Groups are not supported on this controller')
      ).toBeInTheDocument()
    );
    expect(list).not.toHaveBeenCalled();
  });

  it('loads the list when the controller supports VLAN groups', async () => {
    isSupported.mockResolvedValue(true);
    list.mockResolvedValue([]);
    render(<VlanGroupsPage />);
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(
      screen.queryByText('VLAN Groups are not supported on this controller')
    ).not.toBeInTheDocument();
  });
});
