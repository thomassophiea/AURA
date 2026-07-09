/**
 * Guest model semantics — single-appliance mirroring (B1), controller
 * validation set (B2) and defaults-shape round trip (B4).
 */
import { describe, expect, it } from 'vitest';
import {
  fromGuestRecord,
  toGuestPayload,
  updatePort,
  updateShared,
  validateGuest,
  type GuestForm,
} from './guestModel';
import type { EGuestProfile } from '../../../types/configure';

function guest(overrides: Partial<GuestForm> = {}): GuestForm {
  return {
    name: 'Guest1',
    cpFqdn: 'guest.example.com',
    userName: 'cbuser',
    password: 'cbpass123',
    authenticationRadiusServer: {
      ipAddress: '10.0.0.10',
      sharedSecret: 'secret123',
      radiusAuthProtocol: 'PAP',
      preferredMacAddressFormat: 'UPPERCASE_NO_DELIMITERS',
      port: 1812,
      totalRetries: 3,
      timeout: 5,
    },
    accountingRadiusServer: {
      ipAddress: '10.0.0.10',
      sharedSecret: 'secret123',
      radiusAuthProtocol: 'PAP',
      preferredMacAddressFormat: 'UPPERCASE_NO_DELIMITERS',
      port: 1813,
      totalRetries: 3,
      timeout: 5,
    },
    ...overrides,
  };
}

describe('single-appliance mirroring (B1)', () => {
  it('updateShared writes the field into BOTH server objects', () => {
    const next = updateShared(guest(), 'ipAddress', '10.9.9.9');
    expect(next.authenticationRadiusServer.ipAddress).toBe('10.9.9.9');
    expect(next.accountingRadiusServer.ipAddress).toBe('10.9.9.9');
    const secret = updateShared(next, 'sharedSecret', 'newsecret');
    expect(secret.accountingRadiusServer.sharedSecret).toBe('newsecret');
    const timeout = updateShared(secret, 'timeout', 30);
    expect(timeout.accountingRadiusServer.timeout).toBe(30);
    const retries = updateShared(timeout, 'totalRetries', 7);
    expect(retries.accountingRadiusServer.totalRetries).toBe(7);
  });

  it('updatePort keeps the two UDP ports independent', () => {
    const next = updatePort(guest(), 'accountingRadiusServer', 11813);
    expect(next.accountingRadiusServer.port).toBe(11813);
    expect(next.authenticationRadiusServer.port).toBe(1812);
  });

  it('toGuestPayload re-asserts the mirror so the objects can never drift', () => {
    const drifted = guest();
    drifted.accountingRadiusServer = {
      ...drifted.accountingRadiusServer,
      ipAddress: '10.5.5.5',
      sharedSecret: 'stale',
      timeout: 59,
      totalRetries: 1,
    };
    const payload = toGuestPayload(drifted) as GuestForm;
    expect(payload.accountingRadiusServer.ipAddress).toBe('10.0.0.10');
    expect(payload.accountingRadiusServer.sharedSecret).toBe('secret123');
    expect(payload.accountingRadiusServer.timeout).toBe(5);
    expect(payload.accountingRadiusServer.totalRetries).toBe(3);
    // Ports are per-object and untouched by the mirror.
    expect(payload.accountingRadiusServer.port).toBe(1813);
    expect(payload.authenticationRadiusServer.port).toBe(1812);
  });
});

describe('validateGuest (B2)', () => {
  it('accepts a controller-valid record', () => {
    expect(validateGuest(guest())).toEqual({});
  });

  it('requires name, IP pattern and secret >= 6', () => {
    const errs = validateGuest(
      updateShared(updateShared(guest({ name: ' ' }), 'ipAddress', 'bad'), 'sharedSecret', 'abc')
    );
    expect(errs.name).toBe('Name is required');
    expect(errs.ip).toBeTruthy();
    expect(errs.secret).toMatch(/minimum 6/);
  });

  it('enforces timeout 2-60, retries >= 0 and both ports 0-65535', () => {
    let form = updateShared(guest(), 'timeout', 61 as number);
    form = updateShared(form, 'totalRetries', -1 as number);
    form = updatePort(form, 'authenticationRadiusServer', 65536);
    form = updatePort(form, 'accountingRadiusServer', -1);
    const errs = validateGuest(form);
    expect(errs.timeout).toBe('Valid range 2 to 60');
    expect(errs.retries).toBeTruthy();
    expect(errs.authPort).toBe('Valid range 0 to 65535');
    expect(errs.acctPort).toBe('Valid range 0 to 65535');
    expect(validateGuest(updateShared(guest(), 'timeout', 1 as number)).timeout).toBeTruthy();
  });

  it('requires callback password >= 6 only when set', () => {
    expect(validateGuest(guest({ password: '' })).password).toBeUndefined();
    expect(validateGuest(guest({ password: 'abc' })).password).toMatch(/at least 6/);
  });

  it('rejects cleared numeric fields (empty-string transitional state)', () => {
    const errs = validateGuest(updateShared(guest(), 'timeout', ''));
    expect(errs.timeout).toBe('Valid range 2 to 60');
  });
});

describe('record round-trip (B4)', () => {
  it('fromGuestRecord clones the /default seed without sharing state', () => {
    const record = guest() as unknown as EGuestProfile;
    const form = fromGuestRecord(record);
    form.authenticationRadiusServer.ipAddress = 'mutated';
    expect((record.authenticationRadiusServer as { ipAddress: string }).ipAddress).toBe(
      '10.0.0.10'
    );
  });
});
