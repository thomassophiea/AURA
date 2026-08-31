/**
 * Availability/Mobility model tests: the Gateway's 0.0.0.0 ⇄ empty-field
 * sentinel mapping and the system-availability validation set.
 */
import { describe, expect, it } from 'vitest';
import type {
  AvailabilitySettings,
  MobilitySettings,
} from '../../../services/configure/availabilityService';
import {
  UNSET,
  availabilityErrors,
  mobilityErrors,
  shownIp,
  toSentinel,
} from './availabilityModel';

const AVAIL: AvailabilitySettings = {
  availabilityEnabled: true,
  availabilityRole: 'PRIMARY',
  availabilityPairAddr: '192.168.100.13',
  balanceAps: true,
  secureConnection: false,
  staticMtu: 1500,
};

const MOB: MobilitySettings = {
  role: 'Agent',
  mobilityEnabled: false,
  physicalIfIp: UNSET,
  discoveryMethod: 'SLPD',
  mobilityManagerIp: UNSET,
  mobilityBackupManagerIp: UNSET,
  securityMode: null,
  agents: null,
  heartbeat: 5,
};

describe('0.0.0.0 sentinel mapping', () => {
  it('shows the 0.0.0.0 sentinel (and null/undefined) as an empty field', () => {
    expect(shownIp('0.0.0.0')).toBe('');
    expect(shownIp(null)).toBe('');
    expect(shownIp(undefined)).toBe('');
    expect(shownIp('192.168.100.13')).toBe('192.168.100.13');
  });

  it('writes 0.0.0.0 back for an empty/blank field', () => {
    expect(toSentinel('')).toBe(UNSET);
    expect(toSentinel('   ')).toBe(UNSET);
    expect(toSentinel(null)).toBe(UNSET);
    expect(toSentinel('10.0.0.1')).toBe('10.0.0.1');
  });

  it('round-trips: shown → sentinel → shown', () => {
    expect(toSentinel(shownIp(UNSET))).toBe(UNSET);
    expect(shownIp(toSentinel(''))).toBe('');
    expect(shownIp(toSentinel('10.1.1.1'))).toBe('10.1.1.1');
  });
});

describe('availabilityErrors', () => {
  it('is silent while availability is disabled', () => {
    expect(
      availabilityErrors({ ...AVAIL, availabilityEnabled: false, availabilityPairAddr: '' })
    ).toEqual({});
  });

  it('requires a valid non-sentinel peer IP when enabled', () => {
    expect(availabilityErrors({ ...AVAIL, availabilityPairAddr: '' }).pair).toBeTruthy();
    expect(availabilityErrors({ ...AVAIL, availabilityPairAddr: UNSET }).pair).toBeTruthy();
    expect(availabilityErrors({ ...AVAIL, availabilityPairAddr: '999.1.1.1' }).pair).toBeTruthy();
    expect(availabilityErrors(AVAIL).pair).toBeUndefined();
  });

  it('bounds MTU to 600-1500', () => {
    expect(availabilityErrors({ ...AVAIL, staticMtu: 599 }).mtu).toBeTruthy();
    expect(availabilityErrors({ ...AVAIL, staticMtu: 1501 }).mtu).toBeTruthy();
    expect(availabilityErrors({ ...AVAIL, staticMtu: NaN }).mtu).toBeTruthy();
    expect(availabilityErrors({ ...AVAIL, staticMtu: 600 }).mtu).toBeUndefined();
  });
});

describe('mobilityErrors', () => {
  const mobOn: MobilitySettings = { ...MOB, mobilityEnabled: true };

  it('is silent while availability or mobility is off', () => {
    expect(mobilityErrors(mobOn, false)).toEqual({});
    expect(mobilityErrors(MOB, true)).toEqual({});
  });

  it('Manager: bounds heartbeat, allows an unset backup, validates agents', () => {
    const mgr: MobilitySettings = { ...mobOn, role: 'Manager' };
    expect(mobilityErrors({ ...mgr, heartbeat: 0 }, true).heartbeat).toBeTruthy();
    expect(mobilityErrors({ ...mgr, heartbeat: 301 }, true).heartbeat).toBeTruthy();
    expect(mobilityErrors(mgr, true).heartbeat).toBeUndefined();
    // backup manager: sentinel/empty is fine, garbage is not
    expect(mobilityErrors(mgr, true).backupManager).toBeUndefined();
    expect(
      mobilityErrors({ ...mgr, mobilityBackupManagerIp: 'bad' }, true).backupManager
    ).toBeTruthy();
    // each agent needs a valid IP
    const withAgents = { ...mgr, agents: [{ ip: '10.0.0.5' }, { ip: '' }] };
    const errs = mobilityErrors(withAgents, true);
    expect(errs.agent0).toBeUndefined();
    expect(errs.agent1).toBeTruthy();
  });

  it('Agent + Static Configuration requires the manager address', () => {
    const agentStatic: MobilitySettings = {
      ...mobOn,
      role: 'Agent',
      discoveryMethod: 'StaticConfiguration',
    };
    expect(mobilityErrors(agentStatic, true).manager).toBeTruthy();
    expect(
      mobilityErrors({ ...agentStatic, mobilityManagerIp: '10.0.0.1' }, true).manager
    ).toBeUndefined();
    // SLPD discovery needs no manager address
    expect(mobilityErrors({ ...agentStatic, discoveryMethod: 'SLPD' }, true)).toEqual({});
  });
});
