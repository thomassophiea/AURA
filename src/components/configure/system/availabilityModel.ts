/**
 * Pure model for the Availability tab (system-availability.html parity).
 *
 * ONE CONTROLLER QUIRK REPRODUCED: the Gateway uses the string '0.0.0.0' as
 * the sentinel for "not set" on mobilityManagerIp / mobilityBackupManagerIp
 * (and physicalIfIp). Its own getter/setter pair maps 0.0.0.0 <-> empty in
 * the UI, so the same mapping is done here rather than showing 0.0.0.0 in a
 * text box. Kept free of React so it is directly unit-testable.
 */
import type { AvailabilitySettings, MobilitySettings } from '../../../services/configure/availabilityService';

/** The Gateway's "not set" sentinel. */
export const UNSET = '0.0.0.0';

/** The controller's own ipAddressPattern. */
export const RE_IP =
  /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/;

/** Wire value → what the field shows: 0.0.0.0 (and null) display as empty. */
export function shownIp(value: string | null | undefined): string {
  return value === UNSET || value == null ? '' : value;
}

/** Field value → wire value: an empty/blank field writes 0.0.0.0 back. */
export function toSentinel(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? UNSET : trimmed;
}

export const AVAIL_ROLES = [
  { id: 'PRIMARY', label: 'Primary' },
  { id: 'BACKUP', label: 'Backup' },
] as const;

export const MOBILITY_ROLES = [
  { id: 'Manager', label: 'Manager' },
  { id: 'Agent', label: 'Agent' },
] as const;

export const DISCOVERY_METHODS = [
  { id: 'SLPD', label: 'SLPD' },
  { id: 'StaticConfiguration', label: 'Static Configuration' },
] as const;

const isInt = (v: unknown): boolean =>
  v !== '' && v != null && Number.isInteger(Number(v));

const intIn = (v: unknown, lo: number, hi: number): boolean =>
  isInt(v) && Number(v) >= lo && Number(v) <= hi;

/** Availability record validation — only enforced while availability is on. */
export function availabilityErrors(form: AvailabilitySettings): Record<string, string> {
  const e: Record<string, string> = {};
  if (form.availabilityEnabled !== true) return e;
  const pair = String(form.availabilityPairAddr ?? '');
  if (!RE_IP.test(pair) || pair === UNSET) e.pair = 'Enter a valid peer IP address';
  if (!intIn(form.staticMtu, 600, 1500)) e.mtu = 'Valid range 600 to 1500';
  return e;
}

/**
 * Mobility record validation. Mobility is only offered on a paired appliance
 * (the Gateway gates it the same way), so nothing is enforced unless both
 * availability and mobility are enabled.
 */
export function mobilityErrors(
  mob: MobilitySettings,
  availabilityOn: boolean
): Record<string, string> {
  const e: Record<string, string> = {};
  if (!availabilityOn || mob.mobilityEnabled !== true) return e;
  const isManager = mob.role === 'Manager';
  if (isManager) {
    if (!intIn(mob.heartbeat, 1, 300)) e.heartbeat = 'Valid range 1 to 300';
    const backup = shownIp(mob.mobilityBackupManagerIp);
    if (backup && !RE_IP.test(backup)) e.backupManager = 'Enter a valid IP address';
    (mob.agents ?? []).forEach((agent, i) => {
      if (!RE_IP.test(String(agent?.ip ?? ''))) {
        e[`agent${i}`] = `Agent ${i + 1}: enter a valid IP address`;
      }
    });
  } else if (mob.discoveryMethod === 'StaticConfiguration') {
    // Agent + static discovery is the only case that needs the manager's address
    if (!RE_IP.test(shownIp(mob.mobilityManagerIp))) {
      e.manager = 'Manager address is required for static configuration';
    }
  }
  return e;
}

/** True when every value in the error map is falsy. */
export const noErrors = (errs: Record<string, string | null | undefined>): boolean =>
  Object.values(errs).every((e) => !e);
