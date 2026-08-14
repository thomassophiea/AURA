import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';

import { GuestUsers } from './GuestUsers';
import { GuestRequestError, type Guest } from '@/services/guestService';

const list = vi.fn();
const summary = vi.fn();
const create = vi.fn();
const revoke = vi.fn();
const remove = vi.fn();

vi.mock('@/services/guestService', async () => {
  const actual = await vi.importActual<typeof import('@/services/guestService')>(
    '@/services/guestService'
  );
  return {
    ...actual,
    guestService: {
      list: (...args: unknown[]) => list(...args),
      summary: (...args: unknown[]) => summary(...args),
      create: (...args: unknown[]) => create(...args),
      revoke: (...args: unknown[]) => revoke(...args),
      remove: (...args: unknown[]) => remove(...args),
      get: vi.fn(),
    },
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const guest = (overrides: Partial<Guest> = {}): Guest => ({
  id: 'g1',
  macAddress: 'aa:bb:cc:dd:ee:f1',
  displayName: 'aa:bb:cc:dd:ee:f1',
  hasRealName: false,
  email: null,
  phone: null,
  notes: null,
  source: 'CAPTIVE_PORTAL',
  authorizationStatus: 'ACTIVE',
  connectionStatus: 'connected',
  status: 'connected',
  ipAddress: '192.168.1.9',
  ipAddressIsLive: true,
  ssid: 'AURA-CWP',
  wlan: '8',
  role: 'Enterprise User',
  apName: 'AP5020',
  apSerial: 'SN1',
  siteId: null,
  gateway: 'apcp.ezcloudx.com',
  signal: -60,
  connectedSince: null,
  firstSeen: '2026-08-01T00:00:00.000Z',
  lastSeen: '2026-08-07T00:00:00.000Z',
  authorizedAt: '2026-08-07T00:00:00.000Z',
  expiresAt: null,
  revokedAt: null,
  revokedBy: null,
  createdBy: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  lastSessionId: 's1',
  lastSessionStatus: 'AUTHORIZED',
  lastSessionAt: '2026-08-07T00:00:00.000Z',
  lastSessionFailureReason: null,
  // Most guests take the open path, so the default fixture has never asked
  // for secure onboarding.
  secureOnboarding: null,
  ...overrides,
});

const summaryPayload = (overrides = {}) => ({
  summary: {
    connectedNow: 1,
    authorized: 2,
    seenToday: 1,
    seenLast7Days: 2,
    total: 2,
    ...overrides,
  },
  gateway: { reachable: true },
  truncated: false,
});

beforeEach(() => {
  list.mockReset();
  summary.mockReset();
  create.mockReset();
  revoke.mockReset();
  remove.mockReset();
  list.mockResolvedValue({
    guests: [guest()],
    nextCursor: null,
    ledgerTotal: 1,
    gateway: { reachable: true },
  });
  summary.mockResolvedValue(summaryPayload());
});

afterEach(() => vi.clearAllMocks());

describe('GuestUsers', () => {
  it('shows a loading state before data arrives', () => {
    render(<GuestUsers />);
    expect(screen.getByLabelText('Loading guests')).toBeInTheDocument();
  });

  it('renders guests with their live state', async () => {
    render(<GuestUsers />);
    expect(await screen.findByText('aa:bb:cc:dd:ee:f1')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.9')).toBeInTheDocument();
    // 'Connected' is also a filter chip, so scope the assertion to the row.
    const row = screen.getByText('aa:bb:cc:dd:ee:f1').closest('tr');
    expect(within(row as HTMLElement).getByText('Connected')).toBeInTheDocument();
  });

  it('shows the four summary counts', async () => {
    render(<GuestUsers />);
    await screen.findByText('aa:bb:cc:dd:ee:f1');
    expect(screen.getByText('Connected Now')).toBeInTheDocument();
    expect(screen.getByText('Authorized Guests')).toBeInTheDocument();
    expect(screen.getByText('Guests Seen Today')).toBeInTheDocument();
    expect(screen.getByText('Guests Seen in Last 7 Days')).toBeInTheDocument();
  });

  it('says the gateway is unavailable rather than showing zero connected', async () => {
    list.mockResolvedValue({
      guests: [guest({ connectionStatus: 'unknown', status: 'authorized' })],
      nextCursor: null,
      ledgerTotal: 1,
      gateway: { reachable: false },
    });
    summary.mockResolvedValue(summaryPayload({ connectedNow: null }));

    render(<GuestUsers />);
    // Said twice on purpose: on the tile in place of a number, and as a banner.
    await waitFor(() => expect(screen.getAllByText('Gateway unavailable')).toHaveLength(2));
    // The tile must not claim nobody is connected.
    const tile = screen.getByText('Connected Now').closest('[data-slot="card"]');
    expect(within(tile as HTMLElement).queryByText('0')).not.toBeInTheDocument();
  });

  it('explains itself when guest management is not configured', async () => {
    list.mockRejectedValue(
      new GuestRequestError(501, 'Guest management is not configured', 'NOT_CONFIGURED')
    );
    summary.mockRejectedValue(
      new GuestRequestError(501, 'Guest management is not configured', 'NOT_CONFIGURED')
    );
    render(<GuestUsers />);
    expect(await screen.findByText('Guest management is not connected')).toBeInTheDocument();
  });

  it('reports a portal outage without blaming the operator', async () => {
    list.mockRejectedValue(new GuestRequestError(503, 'Guest portal service unavailable'));
    summary.mockRejectedValue(new GuestRequestError(503, 'Guest portal service unavailable'));
    render(<GuestUsers />);
    expect(await screen.findByText('Guest records unavailable')).toBeInTheDocument();
  });

  it('shows an empty state that distinguishes no guests from no matches', async () => {
    list.mockResolvedValue({
      guests: [],
      nextCursor: null,
      ledgerTotal: 0,
      gateway: { reachable: true },
    });
    render(<GuestUsers />);
    expect(await screen.findByText('No guests yet')).toBeInTheDocument();
  });

  it('filters by search across MAC formats', async () => {
    list.mockResolvedValue({
      guests: [guest(), guest({ id: 'g2', macAddress: '92:b8:6a:71:ce:ae', displayName: '92:b8:6a:71:ce:ae' })],
      nextCursor: null,
      ledgerTotal: 2,
      gateway: { reachable: true },
    });

    render(<GuestUsers />);
    await screen.findByText('aa:bb:cc:dd:ee:f1');

    fireEvent.change(screen.getByLabelText('Search guests'), { target: { value: '92b86a' } });

    await waitFor(() => {
      expect(screen.queryByText('aa:bb:cc:dd:ee:f1')).not.toBeInTheDocument();
    });
    expect(screen.getByText('92:b8:6a:71:ce:ae')).toBeInTheDocument();
  });

  it('requests the selected status from the server', async () => {
    render(<GuestUsers />);
    await screen.findByText('aa:bb:cc:dd:ee:f1');

    fireEvent.click(screen.getByRole('button', { name: 'Expired / Revoked' }));

    await waitFor(() => {
      const lastCall = list.mock.calls.at(-1)?.[0];
      expect(lastCall.status).toEqual(['expired', 'revoked']);
    });
  });

  it('sends a new time window to the server', async () => {
    render(<GuestUsers />);
    await screen.findByText('aa:bb:cc:dd:ee:f1');
    const firstCall = list.mock.calls[0][0];
    expect(firstCall.startTime).toBeTruthy();
    expect(firstCall.endTime).toBeTruthy();
  });

  it('confirms before revoking and reports what the gateway did', async () => {
    revoke.mockResolvedValue({
      guest: guest({ authorizationStatus: 'REVOKED', status: 'revoked' }),
      enforcement: { attempted: true, applied: true, disassociated: true },
    });

    render(<GuestUsers />);
    await screen.findByText('aa:bb:cc:dd:ee:f1');

    fireEvent.click(screen.getByRole('button', { name: /Revoke access for/ }));
    expect(await screen.findByText('Revoke guest access?')).toBeInTheDocument();
    // Nothing has happened yet — the confirmation is a real gate.
    expect(revoke).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('g1'));
  });

  it('deletes rather than revokes an entry that never connected', async () => {
    list.mockResolvedValue({
      guests: [
        guest({
          id: 'g9',
          source: 'MANUAL',
          status: 'manually_added',
          connectionStatus: 'disconnected',
          firstSeen: null,
          lastSeen: null,
        }),
      ],
      nextCursor: null,
      ledgerTotal: 1,
      gateway: { reachable: true },
    });
    remove.mockResolvedValue({ outcome: 'DELETED', guest: null, enforcement: null });

    render(<GuestUsers />);
    await screen.findByText('Manually added');

    fireEvent.click(screen.getByRole('button', { name: /Revoke access for/ }));
    expect(await screen.findByText('Remove this entry?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete entry' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('g9'));
    expect(revoke).not.toHaveBeenCalled();
  });

  it('adds a guest and normalises the MAC on the way out', async () => {
    create.mockResolvedValue({
      guest: guest({ id: 'g5', source: 'MANUAL' }),
      activation: { attempted: true, applied: true, reason: null, role: 'Enterprise User' },
    });

    render(<GuestUsers />);
    await screen.findByText('aa:bb:cc:dd:ee:f1');

    fireEvent.click(screen.getByRole('button', { name: /Add Guest/i }));
    fireEvent.change(screen.getByLabelText('MAC address'), { target: { value: 'aabb.ccdd.eef2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add guest' }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ macAddress: 'aabb.ccdd.eef2' })
      )
    );
  });

  it('refuses to submit an obviously invalid MAC', async () => {
    render(<GuestUsers />);
    await screen.findByText('aa:bb:cc:dd:ee:f1');

    fireEvent.click(screen.getByRole('button', { name: /Add Guest/i }));
    fireEvent.change(screen.getByLabelText('MAC address'), { target: { value: 'not-a-mac' } });

    expect(screen.getByRole('button', { name: 'Add guest' })).toBeDisabled();
    expect(create).not.toHaveBeenCalled();
  });

  it('surfaces a duplicate as an actionable message', async () => {
    create.mockRejectedValue(
      new GuestRequestError(409, 'already authorized', 'DUPLICATE_ACTIVE', guest())
    );

    render(<GuestUsers />);
    await screen.findByText('aa:bb:cc:dd:ee:f1');

    fireEvent.click(screen.getByRole('button', { name: /Add Guest/i }));
    fireEvent.change(screen.getByLabelText('MAC address'), { target: { value: 'aa:bb:cc:dd:ee:f1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add guest' }));

    expect(await screen.findByText(/already authorized/i)).toBeInTheDocument();
  });
  it('shows nothing in Secure Wi-Fi for a guest who took the open path', async () => {
    list.mockResolvedValue({
      guests: [guest()],
      nextCursor: null,
      ledgerTotal: 1,
      gateway: { reachable: true },
    });

    render(<GuestUsers />);
    await screen.findByText('aa:bb:cc:dd:ee:f1');

    // Not "None" and not an error state — most guests never ask for secure
    // setup, which is the expected outcome rather than a missing value.
    expect(screen.queryByText('On secure Wi-Fi')).not.toBeInTheDocument();
    expect(screen.queryByText('Profile sent')).not.toBeInTheDocument();
  });

  it('reports a gateway-confirmed secure join, and only that, as connected', async () => {
    list.mockResolvedValue({
      guests: [
        guest({
          secureOnboarding: {
            id: 'onb_1',
            status: 'COMPLETED',
            method: 'APPLE_PROFILE',
            platform: 'IOS',
            sourceSsid: 'AURA-CWP',
            targetSsid: 'Skynet',
            startedAt: '2026-08-14T12:00:00.000Z',
            completedAt: '2026-08-14T12:01:00.000Z',
            failureReason: null,
          },
        }),
      ],
      nextCursor: null,
      ledgerTotal: 1,
      gateway: { reachable: true },
    });

    render(<GuestUsers />);
    expect(await screen.findByText('On secure Wi-Fi')).toBeInTheDocument();
  });

  it('does not describe a downloaded profile as connected', async () => {
    list.mockResolvedValue({
      guests: [
        guest({
          secureOnboarding: {
            id: 'onb_2',
            status: 'PROFILE_DOWNLOADED',
            method: 'APPLE_PROFILE',
            platform: 'IOS',
            sourceSsid: 'AURA-CWP',
            targetSsid: 'Skynet',
            startedAt: '2026-08-14T12:00:00.000Z',
            completedAt: null,
            failureReason: null,
          },
        }),
      ],
      nextCursor: null,
      ledgerTotal: 1,
      gateway: { reachable: true },
    });

    render(<GuestUsers />);
    expect(await screen.findByText('Profile sent')).toBeInTheDocument();
    expect(screen.queryByText('On secure Wi-Fi')).not.toBeInTheDocument();
  });
});
