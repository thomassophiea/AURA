/**
 * Presentation rules for guest records.
 *
 * Kept out of the components so the status vocabulary can be tested without
 * rendering, and so the table, the summary and the dialogs cannot drift into
 * describing the same state two different ways.
 */

import type { Guest, GuestStatus } from '@/services/guestService';

export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info';

interface StatusPresentation {
  label: string;
  variant: BadgeVariant;
  /** Why the row is in this state, shown on hover. */
  description: string;
}

export const STATUS_PRESENTATION: Record<GuestStatus, StatusPresentation> = {
  connected: {
    label: 'Connected',
    variant: 'success',
    description: 'Associated with the gateway right now.',
  },
  authorized: {
    label: 'Authorized',
    variant: 'info',
    description: 'Allowed on the guest network. Not currently associated.',
  },
  disconnected: {
    label: 'Disconnected',
    variant: 'secondary',
    description: 'Still authorized, but not associated with the gateway.',
  },
  expired: {
    label: 'Expired',
    variant: 'warning',
    description: 'The access window has passed. The portal will refuse this device.',
  },
  revoked: {
    label: 'Revoked',
    variant: 'destructive',
    description: 'Access was withdrawn by an operator. Kept for audit.',
  },
  manually_added: {
    label: 'Manually added',
    variant: 'outline',
    description: 'Authorized by an operator; this device has not connected yet.',
  },
  failed: {
    label: 'Failed',
    variant: 'destructive',
    description: 'The gateway refused the last authorization attempt.',
  },
};

/** The filter chips. `expired` covers both expired and revoked, as one control. */
export const STATUS_FILTERS: ReadonlyArray<{
  id: string;
  label: string;
  statuses: GuestStatus[];
}> = [
  { id: 'all', label: 'All', statuses: [] },
  { id: 'connected', label: 'Connected', statuses: ['connected'] },
  { id: 'authorized', label: 'Authorized', statuses: ['authorized', 'manually_added'] },
  { id: 'disconnected', label: 'Disconnected', statuses: ['disconnected'] },
  { id: 'inactive', label: 'Expired / Revoked', statuses: ['expired', 'revoked'] },
];

/** Time windows, in AURA's shared range vocabulary. */
export const TIME_PRESETS: ReadonlyArray<{ token: string; label: string }> = [
  { token: 'day-0', label: 'Today' },
  { token: 'day-1', label: 'Yesterday' },
  { token: '3d', label: 'Last 3 Days' },
  { token: '7d', label: 'Last 7 Days' },
];

export const DEFAULT_TIME_TOKEN = '7d';

/**
 * How the device is identified in the list.
 *
 * This portal collects no name, so the MAC is the identifier — said plainly
 * rather than dressed up as "Guest 1", which would imply an identity nobody
 * captured.
 */
export function guestLabel(guest: Guest): string {
  return guest.hasRealName ? guest.displayName : guest.macAddress;
}

/** Whether removing this record destroys history or preserves it. */
export function isDestructiveRemoval(guest: Guest): boolean {
  return guest.lastSeen !== null || guest.firstSeen !== null;
}

/** Human phrasing for what AURA managed to do on the gateway. */
export function describeActivation(activation: {
  attempted: boolean;
  applied: boolean;
  reason: string | null;
  role?: string;
}): string {
  if (activation.applied) {
    return activation.role
      ? `The device was already connected and has been moved into the ${activation.role} role.`
      : 'The device was already connected and has been authorized on the gateway.';
  }
  switch (activation.reason) {
    case 'not_associated':
      return 'The device is not connected yet. It will be authorized as soon as it joins the network.';
    case 'gateway_unreachable':
      return 'Saved, but the gateway could not be reached to authorize the device immediately. It will be authorized when it next connects.';
    case 'no_authenticated_role':
      return 'Saved, but the WLAN this device is on has no authenticated role to move it into.';
    case 'gateway_error':
      return 'Saved, but the gateway refused the immediate role change. The device will be authorized when it next connects.';
    default:
      return 'Saved.';
  }
}

/** Human phrasing for what a revocation actually reached. */
export function describeEnforcement(
  enforcement: { applied: boolean; reason?: string; disassociated?: boolean } | null
): string {
  if (!enforcement) return 'Access withdrawn.';
  if (enforcement.applied) {
    return enforcement.disassociated
      ? 'Access withdrawn and the device disconnected from the network.'
      : 'Access withdrawn and the device moved out of the authorized role.';
  }
  switch (enforcement.reason) {
    case 'not_connected':
      return 'Access withdrawn. The device was not connected, so there was nothing to disconnect.';
    case 'gateway_unreachable':
      return 'Access withdrawn in the portal, but the gateway could not be reached — a device that is connected now keeps its session until it reconnects.';
    case 'gateway_error':
      return 'Access withdrawn in the portal, but the gateway refused the disconnect. The device keeps its current session.';
    default:
      return 'Access withdrawn.';
  }
}
