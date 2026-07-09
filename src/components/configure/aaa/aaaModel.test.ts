/**
 * AAA model semantics — controller ranges and the nullable-object /
 * zero-means-off encodings from parity gaps A1-A5, A7, A10.
 */
import { describe, expect, it } from 'vitest';
import {
  AAA_NAME_RE,
  DENY_DEFAULTS,
  MAX_RADIUS_SERVERS,
  availableAuthIps,
  copyAuthServerToAcct,
  fromAaaRecord,
  isDenyEnabled,
  isReauthEnabled,
  moveItem,
  newRadiusServer,
  setDenyEnabled,
  setReauthEnabled,
  toAaaPayload,
  upsertAt,
  validateAaaPolicy,
  validateRadiusServer,
  type AaaPolicyForm,
  type AaaServerForm,
} from './aaaModel';
import type { AaaPolicy } from '../../../types/configure';

function server(overrides: Partial<AaaServerForm> = {}): AaaServerForm {
  return { ...newRadiusServer('auth'), ipAddress: '10.0.0.1', sharedSecret: 'secret123', ...overrides };
}

function policy(overrides: Partial<AaaPolicyForm> = {}): AaaPolicyForm {
  return {
    name: 'Policy1',
    policyType: 'Standard',
    healthCheck: 60,
    accountingStart: 'NoDelay',
    attributes: { calledStationId: 'WiredMacColonSsid', nasIpAddress: '0.0.0.0', nasId: 'nas' },
    accountingInterimInterval: 60,
    includeFramedIp: false,
    includeMsgAuth: true,
    accountingType: 'StartInterimStop',
    authenticationType: 'PAP',
    reauthTimeoutOvr: 0,
    operatorName: '',
    operatorNamespace: 'None',
    denyOnAuthFailure: null,
    naiRealms: null,
    serverPoolingMode: 'failover',
    reportNasLocation: false,
    accountingAccessAlg: 'Broadcast',
    naiRouting: false,
    eventTimestamp: false,
    authenticationRadiusServers: [],
    accountingRadiusServers: [],
    ...overrides,
  };
}

describe('validateRadiusServer', () => {
  it('accepts a controller-valid server', () => {
    expect(validateRadiusServer(server(), 'auth')).toEqual({});
  });

  it('enforces IP pattern, port, retries 1-32, timeout 1-360', () => {
    const errs = validateRadiusServer(
      server({ ipAddress: '999.1.1.1', port: 70000, totalRetries: 0, timeout: 361 }),
      'auth'
    );
    expect(errs.ipAddress).toBeTruthy();
    expect(errs.port).toBe('Valid range 0 to 65535');
    expect(errs.totalRetries).toBe('Valid range 1 to 32');
    expect(errs.timeout).toBe('Valid range 1 to 360');
  });

  it('enforces poll interval 30-300 on auth tables only', () => {
    const bad = server({ pollInterval: 29 });
    expect(validateRadiusServer(bad, 'auth').pollInterval).toBe('Valid range 30 to 300');
    expect(validateRadiusServer(bad, 'acct').pollInterval).toBeUndefined();
  });

  it('requires a shared secret of at least 6 characters', () => {
    expect(validateRadiusServer(server({ sharedSecret: 'abc' }), 'auth').sharedSecret).toMatch(
      /minimum 6/
    );
    expect(validateRadiusServer(server({ sharedSecret: '' }), 'auth').sharedSecret).toBeTruthy();
  });

  it('requires a trust point for Secure servers', () => {
    expect(
      validateRadiusServer(server({ serverType: 'Secure', trustPoint: null }), 'auth').trustPoint
    ).toBeTruthy();
    expect(
      validateRadiusServer(server({ serverType: 'Secure', trustPoint: 'tp1' }), 'auth').trustPoint
    ).toBeUndefined();
  });
});

describe('server list mutations', () => {
  const list = [server({ ipAddress: '10.0.0.1' }), server({ ipAddress: '10.0.0.2' })];

  it('moveItem swaps adjacent entries (order = priority)', () => {
    const moved = moveItem(list, 0, 1);
    expect(moved.map((s) => s.ipAddress)).toEqual(['10.0.0.2', '10.0.0.1']);
  });

  it('moveItem is a no-op at the list edges', () => {
    expect(moveItem(list, 0, -1)).toBe(list);
    expect(moveItem(list, 1, 1)).toBe(list);
  });

  it('upsertAt appends for index -1 and replaces in place otherwise', () => {
    const added = upsertAt(list, -1, server({ ipAddress: '10.0.0.3' }));
    expect(added).toHaveLength(3);
    const replaced = upsertAt(list, 0, server({ ipAddress: '10.9.9.9' }));
    expect(replaced[0].ipAddress).toBe('10.9.9.9');
    expect(replaced).toHaveLength(2);
  });

  it('copyAuthServerToAcct clones the auth entry with the accounting port 1813', () => {
    const acct = copyAuthServerToAcct(list, [], '10.0.0.2');
    expect(acct).toHaveLength(1);
    expect(acct[0].ipAddress).toBe('10.0.0.2');
    expect(acct[0].port).toBe(1813);
    expect(acct[0].sharedSecret).toBe(list[1].sharedSecret);
  });

  it('copyAuthServerToAcct refuses duplicates and the 4-server cap', () => {
    const dup = copyAuthServerToAcct(list, [server({ ipAddress: '10.0.0.2' })], '10.0.0.2');
    expect(dup).toHaveLength(1);
    const full = Array.from({ length: MAX_RADIUS_SERVERS }, (_, i) =>
      server({ ipAddress: `10.1.1.${i}` })
    );
    expect(copyAuthServerToAcct(list, full, '10.0.0.1')).toBe(full);
  });

  it('availableAuthIps excludes IPs already present in the acct list', () => {
    expect(availableAuthIps(list, [server({ ipAddress: '10.0.0.1' })])).toEqual(['10.0.0.2']);
  });

  it('new acct servers seed port 1813, auth servers 1812', () => {
    expect(newRadiusServer('acct').port).toBe(1813);
    expect(newRadiusServer('auth').port).toBe(1812);
  });
});

describe('denyOnAuthFailure nullable-object semantics (A2/A3)', () => {
  it('is off when the record carries null', () => {
    expect(isDenyEnabled(policy())).toBe(false);
  });

  it('toggling on seeds the in-range defaults; off emits null', () => {
    const on = setDenyEnabled(policy(), true);
    expect(on.denyOnAuthFailure).toEqual(DENY_DEFAULTS);
    expect(isDenyEnabled(on)).toBe(true);
    expect(setDenyEnabled(on, false).denyOnAuthFailure).toBeNull();
  });

  it('validates members 1-10 / 1-10 / 1-300 only while enabled', () => {
    expect(validateAaaPolicy(policy()).denyAttempts).toBeUndefined();
    const errs = validateAaaPolicy(
      policy({ denyOnAuthFailure: { attempts: 11, interval: 0, timeout: 301 } })
    );
    expect(errs.denyAttempts).toBe('Valid range 1 to 10');
    expect(errs.denyInterval).toBe('Valid range 1 to 10');
    expect(errs.denyTimeout).toBe('Valid range 1 to 300');
  });
});

describe('reauthTimeoutOvr zero-means-off semantics (A4)', () => {
  it('0 is off and valid; 60-300 required when on', () => {
    expect(isReauthEnabled(policy())).toBe(false);
    expect(validateAaaPolicy(policy()).reauth).toBeUndefined();
    expect(validateAaaPolicy(policy({ reauthTimeoutOvr: 59 })).reauth).toBe('Valid range 60 to 300');
    expect(validateAaaPolicy(policy({ reauthTimeoutOvr: 301 })).reauth).toBe(
      'Valid range 60 to 300'
    );
    expect(validateAaaPolicy(policy({ reauthTimeoutOvr: 300 })).reauth).toBeUndefined();
  });

  it('toggling on seeds 60; off writes 0', () => {
    const on = setReauthEnabled(policy(), true);
    expect(on.reauthTimeoutOvr).toBe(60);
    expect(setReauthEnabled(on, false).reauthTimeoutOvr).toBe(0);
  });
});

describe('validateAaaPolicy scalar rules', () => {
  it('requires name matching the controller pattern', () => {
    expect(validateAaaPolicy(policy({ name: '' })).name).toBe('Name is required');
    expect(validateAaaPolicy(policy({ name: '<bad>' })).name).toBeTruthy();
    expect(AAA_NAME_RE.test('Policy 1.2_x-y')).toBe(true);
  });

  it('requires NAS IP pattern + NAS ID and interim 60-3600', () => {
    const errs = validateAaaPolicy(
      policy({
        attributes: { calledStationId: 'Bssid', nasIpAddress: 'nope', nasId: ' ' },
        accountingInterimInterval: 3601,
      })
    );
    expect(errs.nasIp).toBeTruthy();
    expect(errs.nasId).toBe('NAS ID is required');
    expect(errs.interim).toBe('Valid range 60 to 3600');
  });

  it('flags invalid realm entries only while NAI routing is on', () => {
    const realms = [{ realm: '', authenticationRadiusServers: [], accountingRadiusServers: [] }];
    expect(validateAaaPolicy(policy({ naiRouting: true, naiRealms: realms })).naiRealms).toBeTruthy();
    expect(validateAaaPolicy(policy({ naiRouting: false, naiRealms: realms })).naiRealms).toBeUndefined();
  });
});

describe('record round-trip', () => {
  it('fromAaaRecord normalizes deny/realms and toAaaPayload nulls realms when routing is off', () => {
    const record = {
      id: 'x',
      name: 'P',
      denyOnAuthFailure: null,
      naiRealms: null,
      attributes: { calledStationId: 'Bssid', nasIpAddress: '0.0.0.0', nasId: 'n' },
      authenticationRadiusServers: [],
      accountingRadiusServers: [],
      naiRouting: false,
    } as unknown as AaaPolicy;
    const form = fromAaaRecord(record);
    expect(form.denyOnAuthFailure).toBeNull();
    expect(form.naiRealms).toBeNull();
    const payload = toAaaPayload({ ...form, naiRealms: [], naiRouting: false });
    expect((payload as { naiRealms: unknown }).naiRealms).toBeNull();
  });
});
