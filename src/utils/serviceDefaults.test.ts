import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateDefaultService,
  generatePrivacyConfig,
  mapSecurityTypeFromPrivacy,
  validateServiceData,
} from './serviceDefaults';

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('generateDefaultService', () => {
  it('returns a Partial<Service> with sensible defaults', () => {
    const out = generateDefaultService();
    expect(out).toHaveProperty('serviceName');
    expect(out).toHaveProperty('ssid');
  });

  it('overrides win over defaults', () => {
    const out = generateDefaultService({ serviceName: 'Custom-Name' });
    expect(out.serviceName).toBe('Custom-Name');
  });
});

describe('generatePrivacyConfig', () => {
  it('open → null', () => {
    expect(generatePrivacyConfig('open')).toBeNull();
  });

  it('wpa2-personal builds WpaPskElement with passphrase', () => {
    const cfg = generatePrivacyConfig('wpa2-personal', 'hunter2-pw');
    expect(cfg.WpaPskElement.presharedKey).toBe('hunter2-pw');
    expect(cfg.WpaPskElement.mode).toBe('aesOnly');
  });

  it('wpa-personal goes through the WpaPskElement branch too', () => {
    const cfg = generatePrivacyConfig('wpa-personal', 'pw');
    expect(cfg.WpaPskElement).toBeDefined();
  });

  it('wpa3-personal builds WpaSaeElement with passphrase', () => {
    const cfg = generatePrivacyConfig('wpa3-personal', 'pw');
    expect(cfg.WpaSaeElement.presharedKey).toBe('pw');
    expect(cfg.WpaSaeElement.pmfMode).toBe('required');
  });

  it('wpa3-sae shares the WpaSaeElement branch', () => {
    expect(generatePrivacyConfig('wpa3-sae', 'pw').WpaSaeElement).toBeDefined();
  });

  it('wpa2-enterprise builds WpaEnterpriseElement (pmfMode disabled)', () => {
    const cfg = generatePrivacyConfig('wpa2-enterprise');
    expect(cfg.WpaEnterpriseElement.pmfMode).toBe('disabled');
  });

  it('wpa3-enterprise builds WpaEnterpriseElement (pmfMode required)', () => {
    const cfg = generatePrivacyConfig('wpa3-enterprise');
    expect(cfg.WpaEnterpriseElement.pmfMode).toBe('required');
  });

  it('unknown security type warns and returns null', () => {
    expect(generatePrivacyConfig('made-up')).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });
});

describe('mapSecurityTypeFromPrivacy', () => {
  it('null/undefined privacy → Open', () => {
    expect(mapSecurityTypeFromPrivacy(null)).toBe('Open');
    expect(mapSecurityTypeFromPrivacy(undefined)).toBe('Open');
  });

  it('WpaSaeElement → WPA3-Personal (SAE)', () => {
    expect(mapSecurityTypeFromPrivacy({ WpaSaeElement: {} })).toBe('WPA3-Personal (SAE)');
  });

  it('WpaPskElement aesOnly → WPA2-Personal (AES)', () => {
    expect(mapSecurityTypeFromPrivacy({ WpaPskElement: { mode: 'aesOnly' } })).toBe(
      'WPA2-Personal (AES)'
    );
  });

  it('WpaPskElement tkipOnly → WPA-Personal (TKIP)', () => {
    expect(mapSecurityTypeFromPrivacy({ WpaPskElement: { mode: 'tkipOnly' } })).toBe(
      'WPA-Personal (TKIP)'
    );
  });

  it('WpaPskElement mixed → WPA/WPA2-Personal', () => {
    expect(mapSecurityTypeFromPrivacy({ WpaPskElement: { mode: 'mixed' } })).toBe(
      'WPA/WPA2-Personal'
    );
  });

  it('WpaPskElement no mode → "WPA-Personal" fallback', () => {
    expect(mapSecurityTypeFromPrivacy({ WpaPskElement: {} })).toBe('WPA-Personal');
  });

  it('WpaEnterpriseElement pmfMode required → WPA3-Enterprise', () => {
    expect(mapSecurityTypeFromPrivacy({ WpaEnterpriseElement: { pmfMode: 'required' } })).toBe(
      'WPA3-Enterprise'
    );
  });

  it('WpaEnterpriseElement no pmfMode → WPA2-Enterprise', () => {
    expect(mapSecurityTypeFromPrivacy({ WpaEnterpriseElement: {} })).toBe('WPA2-Enterprise');
  });

  it('OweElement → OWE (Enhanced Open)', () => {
    expect(mapSecurityTypeFromPrivacy({ OweElement: {} })).toBe('OWE (Enhanced Open)');
  });

  it('Unknown shape → Unknown', () => {
    expect(mapSecurityTypeFromPrivacy({ SomethingElse: {} })).toBe('Unknown');
  });
});

describe('validateServiceData', () => {
  it('valid: name + ssid + reasonable timeouts', () => {
    const r = validateServiceData({
      serviceName: 'Voice',
      ssid: 'voice-wlan',
      preAuthenticatedIdleTimeout: 0,
      postAuthenticatedIdleTimeout: 1800,
      sessionTimeout: 0,
    });
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('invalid: missing serviceName', () => {
    const r = validateServiceData({ ssid: 'x' });
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/Service name/);
  });

  it('invalid: blank serviceName / ssid', () => {
    const r = validateServiceData({ serviceName: '   ', ssid: '' });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /Service name/.test(e))).toBe(true);
    expect(r.errors.some((e) => /SSID is required/.test(e))).toBe(true);
  });

  it('invalid: SSID > 32 chars', () => {
    const r = validateServiceData({
      serviceName: 'x',
      ssid: 'a'.repeat(33),
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /32 characters/.test(e))).toBe(true);
  });

  it('invalid: passphrase < 8 or > 63 chars (WpaPsk)', () => {
    const r1 = validateServiceData({
      serviceName: 'x',
      ssid: 'x',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      privacy: { WpaPskElement: { presharedKey: 'short' } } as any,
    });
    expect(r1.valid).toBe(false);
    const r2 = validateServiceData({
      serviceName: 'x',
      ssid: 'x',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      privacy: { WpaPskElement: { presharedKey: 'a'.repeat(64) } } as any,
    });
    expect(r2.valid).toBe(false);
  });

  it('valid: passphrase between 8..63 chars (WpaSae)', () => {
    const r = validateServiceData({
      serviceName: 'x',
      ssid: 'x',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      privacy: { WpaSaeElement: { presharedKey: 'goodpassphrase' } } as any,
    });
    expect(r.valid).toBe(true);
  });

  it('invalid: negative timeout values', () => {
    const r = validateServiceData({
      serviceName: 'x',
      ssid: 'x',
      preAuthenticatedIdleTimeout: -1,
      postAuthenticatedIdleTimeout: -10,
      sessionTimeout: -100,
    });
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });
});
