/**
 * Save-synthesis + validation tests for the WLAN editor form state, run on
 * real controller records (wlanFixtures.ts).
 */
import { describe, expect, it } from 'vitest';
import {
  buildWlanPayload,
  createFormState,
  validateWlan,
  wepKeyExpectedLength,
  withPrivacyField,
  type WlanFormState,
} from './wlanForm';
import { DEFAULTS, LAB_6GHZ, SKYNET, withPrivacy } from './wlanFixtures';
import type { WlanAuthType } from './wlanModel';

function formFor(
  record = structuredClone(DEFAULTS),
  authType?: WlanAuthType,
  ui: Partial<WlanFormState['ui']> = {}
): WlanFormState {
  const state = createFormState(record);
  return {
    ...state,
    ui: { ...state.ui, ...(authType ? { authType } : {}), ...ui },
  };
}

describe('buildWlanPayload — save synthesis (parity gap #32)', () => {
  it('persists exactly one privacy element for the chosen auth type', () => {
    // Record polluted with a stale second element (simulates an auth switch).
    const record = structuredClone(SKYNET);
    record.privacy = {
      ...record.privacy,
      // Partial stale element — the save path must drop it wholesale.
      WpaSaeElement: {
        presharedKey: 'stale',
        pmfMode: 'required',
      } as import('../../../types/configure').WpaSaeElement,
    };
    const payload = buildWlanPayload(formFor(record, 'WPA2-Personal (PSK)'));
    expect(Object.keys(payload.privacy ?? {})).toEqual(['WpaPskElement']);
    expect(payload.privacy?.WpaPskElement).toMatchObject({
      mode: 'aesOnly',
      presharedKey: 'Annabell7',
    });
  });

  it('pins pmfMode to required for pure WPA3 on save', () => {
    const record = structuredClone(LAB_6GHZ);
    (record.privacy!.WpaSaeElement as { pmfMode: string }).pmfMode = 'disabled';
    const payload = buildWlanPayload(formFor(record, 'WPA3-Personal'));
    expect(payload.privacy?.WpaSaeElement).toMatchObject({ pmfMode: 'required' });
  });

  it('does not pin pmfMode for WPA3 Transition', () => {
    const record = withPrivacy('Wpa3EnterpriseTransitionElement', { pmfMode: 'enabled' });
    const payload = buildWlanPayload(
      formFor(record, 'WPA3-Enterprise Transition (802.1X/EAP)')
    );
    const element = payload.privacy?.Wpa3EnterpriseTransitionElement as { pmfMode: string };
    expect(element.pmfMode).toBe('enabled');
  });

  it('nulls privacy for Open networks', () => {
    const payload = buildWlanPayload(formFor(structuredClone(SKYNET), 'Open'));
    expect(payload.privacy).toBeNull();
  });

  it('round-trips the real LAB-6GHz record byte-identically', () => {
    const payload = buildWlanPayload(formFor(structuredClone(LAB_6GHZ)));
    expect(payload).toEqual(LAB_6GHZ);
  });

  it('never leaks UI-model keys onto the persisted record', () => {
    const payload = buildWlanPayload(
      formFor(structuredClone(SKYNET), undefined, {
        cpRedirect: 'https://portal.example.com',
        radiusServers: ['10.0.0.1', '', '', ''],
      })
    ) as unknown as Record<string, unknown>;
    for (const key of ['ui', 'authType', 'authMethod', 'cpRedirect', 'radiusServers']) {
      expect(payload).not.toHaveProperty(key);
    }
  });

  it('folds hs20.qosMap into hotspot only when Hotspot is Enabled', () => {
    const enabled = buildWlanPayload(
      formFor(withPrivacy(null, {}, { hotspotType: 'Enabled' }), 'Open', { hs20QosMap: true })
    );
    expect(enabled.hotspot).toMatchObject({ hs20: { qosMap: true } });
    const disabled = buildWlanPayload(formFor(structuredClone(SKYNET)));
    expect(disabled.hotspot).toBeNull();
  });
});

describe('withPrivacyField', () => {
  it('writes into the active element immutably', () => {
    const form = formFor(structuredClone(SKYNET));
    const next = withPrivacyField(form, 'presharedKey', 'NewSecret1');
    expect(
      (next.record.privacy?.WpaPskElement as { presharedKey: string }).presharedKey
    ).toBe('NewSecret1');
    expect(
      (form.record.privacy?.WpaPskElement as { presharedKey: string }).presharedKey
    ).toBe('Annabell7');
  });
});

describe('validateWlan — controller required/pattern/range rules', () => {
  it('requires Network Name and SSID', () => {
    const errors = validateWlan(formFor(), true);
    expect(errors.serviceName).toMatch(/required/i);
    expect(errors.ssid).toMatch(/required/i);
  });

  it('rejects names violating the controller pattern', () => {
    const record = { ...structuredClone(DEFAULTS), serviceName: '-bad*name', ssid: 'ok' };
    expect(validateWlan(formFor(record), true).serviceName).toBeTruthy();
  });

  it('accepts the real live records as valid', () => {
    expect(validateWlan(formFor(structuredClone(SKYNET)), false)).toEqual({});
    expect(validateWlan(formFor(structuredClone(LAB_6GHZ)), false)).toEqual({});
  });

  it('enforces PSK 8-63 chars (string) and exactly 64 hex (hex mode)', () => {
    const short = structuredClone(SKYNET);
    (short.privacy!.WpaPskElement as { presharedKey: string }).presharedKey = 'short';
    expect(validateWlan(formFor(short), false).presharedKey).toMatch(/8 to 63/);

    const hex = structuredClone(SKYNET);
    Object.assign(hex.privacy!.WpaPskElement as object, {
      keyHexEncoded: true,
      presharedKey: 'abc123',
    });
    expect(validateWlan(formFor(hex), false).presharedKey).toMatch(/64 hex/);

    const goodHex = structuredClone(SKYNET);
    Object.assign(goodHex.privacy!.WpaPskElement as object, {
      keyHexEncoded: true,
      presharedKey: 'a'.repeat(64),
    });
    expect(validateWlan(formFor(goodHex), false).presharedKey).toBeUndefined();
  });

  it.each([
    ['WEP_64bit', 'Hex', 10],
    ['WEP_64bit', 'Ascii', 5],
    ['Wep_128bit', 'Hex', 26],
    ['Wep_128bit', 'Ascii', 13],
  ])('enforces WEP %s/%s keys of length %i', (keyLength, pskInputType, length) => {
    expect(wepKeyExpectedLength({ keyLength, pskInputType })).toMatchObject({ length });
    const record = withPrivacy('WepElement', {
      keyLength,
      pskInputType,
      keyIndex: '1',
      passPhrase: 'f'.repeat(length),
    });
    expect(validateWlan(formFor(record, 'WEP'), false).wepKey).toBeUndefined();
    const bad = withPrivacy('WepElement', { keyLength, pskInputType, passPhrase: 'xx' });
    expect(validateWlan(formFor(bad, 'WEP'), false).wepKey).toContain(`${length}`);
  });

  it('rejects non-hex WEP keys in Hex mode', () => {
    const record = withPrivacy('WepElement', {
      keyLength: 'WEP_64bit',
      pskInputType: 'Hex',
      passPhrase: 'zzzzzzzzzz',
    });
    expect(validateWlan(formFor(record, 'WEP'), false).wepKey).toBeTruthy();
  });

  it('requires Mobility Domain ID 0-65535 in edit mode when FT is enabled', () => {
    const record = withPrivacy('WpaEnterpriseElement', {
      fastTransitionEnabled: true,
      fastTransitionMdId: 70000,
    });
    const editErrors = validateWlan(formFor(record, 'WPA2-Enterprise (802.1X/EAP)'), false);
    expect(editErrors.mobilityDomainId).toMatch(/0 to 65535/);
    // Create mode: the controller hides (and does not validate) the field.
    const createErrors = validateWlan(formFor(record, 'WPA2-Enterprise (802.1X/EAP)'), true);
    expect(createErrors.mobilityDomainId).toBeUndefined();
  });

  it('bounds the three timeouts to 0-999999 integers', () => {
    const record = { ...structuredClone(SKYNET), sessionTimeout: 1000000 };
    expect(validateWlan(formFor(record), false).sessionTimeout).toMatch(/999999/);
    const negative = { ...structuredClone(SKYNET), preAuthenticatedIdleTimeout: -1 };
    expect(validateWlan(formFor(negative), false).preAuthenticatedIdleTimeout).toBeTruthy();
  });

  it('requires the ECP URL for an enabled External portal', () => {
    const record = {
      ...structuredClone(SKYNET),
      enableCaptivePortal: true,
      captivePortalType: 'External',
    };
    expect(validateWlan(formFor(record), false).cpRedirect).toMatch(/ECP URL/);
    const withUrl = formFor(record, undefined, { cpRedirect: 'https://portal.example.com' });
    expect(validateWlan(withUrl, false).cpRedirect).toBeUndefined();
  });

  it('requires the unauthenticated role when MBA is on and CP is off (gap #8)', () => {
    const record = {
      ...structuredClone(SKYNET),
      mbaAuthorization: true,
      enableCaptivePortal: false,
      unAuthenticatedUserDefaultRoleID: null,
    };
    expect(validateWlan(formFor(record), false).unauthenticatedRole).toBeTruthy();
    const withRole = { ...record, unAuthenticatedUserDefaultRoleID: 'role-1' };
    expect(validateWlan(formFor(withRole), false).unauthenticatedRole).toBeUndefined();
  });
});

describe('controller UI-model blocks round-trip (selectedCpConfig / aaaConf / openRoamingModel)', () => {
  it('hydrates the ui block from a persisted selectedCpConfig', () => {
    const record = {
      ...structuredClone(SKYNET),
      enableCaptivePortal: true,
      captivePortalType: 'External',
      selectedCpConfig: {
        name: 'default',
        selectedPortalInterface: 'topo-1',
        cpRedirectPorts: [8080, 8443],
        wallGardenRole: {
          cpRedirect: 'https://portal.example.com',
          cpIdentity: 'guest-op',
          cpSharedKey: 'sup3rsecret',
          cpRedirectUrlSelect: 'URLCUSTOMIZED',
          cpDefaultRedirectUrl: 'https://example.com/welcome',
          cpHttp: false,
          cpUseFQDN: true,
          rules: [{ domain: 'cdn.example.com', ip: '', port: '443' }],
        },
      },
    };
    const { ui } = createFormState(record);
    expect(ui.cpRedirect).toBe('https://portal.example.com');
    expect(ui.cpIdentity).toBe('guest-op');
    expect(ui.cpSharedKey).toBe('sup3rsecret');
    expect(ui.cpRedirectUrlSelect).toBe('URLCUSTOMIZED');
    expect(ui.cpDefaultRedirectUrl).toBe('https://example.com/welcome');
    expect(ui.cpHttps).toBe(false);
    expect(ui.cpUseFqdn).toBe(true);
    expect(ui.cpRedirectPorts).toEqual([8080, 8443]);
    expect(ui.walledGardenRules).toEqual([{ domain: 'cdn.example.com', ip: '', port: '443' }]);
    expect(ui.portalName).toBe('default');
    expect(ui.portalInterface).toBe('topo-1');
  });

  it('serializes the captive-portal ui block on save when a portal is enabled', () => {
    const record = {
      ...structuredClone(SKYNET),
      enableCaptivePortal: true,
      captivePortalType: 'External',
    };
    const payload = buildWlanPayload(
      formFor(record, undefined, {
        cpRedirect: 'https://portal.example.com',
        cpIdentity: 'guest-op',
        cpRedirectPorts: [8080],
        walledGardenRules: [{ domain: 'cdn.example.com', ip: '', port: '' }],
      })
    ) as ReturnType<typeof buildWlanPayload> & {
      selectedCpConfig?: { wallGardenRole?: Record<string, unknown>; cpRedirectPorts?: number[] };
    };
    expect(payload.selectedCpConfig?.wallGardenRole).toMatchObject({
      cpRedirect: 'https://portal.example.com',
      cpIdentity: 'guest-op',
    });
    expect(payload.selectedCpConfig?.cpRedirectPorts).toEqual([8080]);
  });

  it('omits selectedCpConfig for clean records without a portal (byte-safe)', () => {
    const payload = buildWlanPayload(formFor(structuredClone(SKYNET)));
    expect(payload).not.toHaveProperty('selectedCpConfig');
    expect(payload).not.toHaveProperty('aaaConf');
    expect(payload).not.toHaveProperty('openRoamingModel');
  });

  it('persists openRoamingModel for WBA OpenRoaming networks', () => {
    const record = { ...structuredClone(SKYNET), hotspotType: 'OpenRoaming' };
    const payload = buildWlanPayload(
      formFor(record, 'WPA3-Enterprise (802.1X/EAP)', { trustPoint: 'tp-1', wbaId: 'WBA-42' })
    ) as ReturnType<typeof buildWlanPayload> & { openRoamingModel?: Record<string, unknown> };
    expect(payload.openRoamingModel).toEqual({ trustPoint: 'tp-1', wbaId: 'WBA-42' });
  });

  it('persists aaaConf once a proxy-RADIUS method is configured', () => {
    const record = withPrivacy('WpaEnterpriseElement', { pmfMode: 'enabled' });
    const payload = buildWlanPayload(
      formFor(record, 'WPA2-Enterprise (802.1X/EAP)', {
        authMethod: 'Proxy RADIUS (Failover)',
        radiusServers: ['10.0.0.10', '', '', ''],
      })
    ) as ReturnType<typeof buildWlanPayload> & { aaaConf?: Record<string, unknown> };
    expect(payload.aaaConf).toMatchObject({
      selectedAuthMethod: 'Proxy RADIUS (Failover)',
      radiusServers: ['10.0.0.10', '', '', ''],
    });
    // Default/untouched enterprise records stay unchanged on the wire.
    const untouched = buildWlanPayload(formFor(record, 'WPA2-Enterprise (802.1X/EAP)'));
    expect(untouched).not.toHaveProperty('aaaConf');
  });
});
