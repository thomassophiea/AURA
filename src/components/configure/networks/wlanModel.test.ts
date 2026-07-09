/**
 * Privacy-element derivation + hotspot gating tests for the WLAN model,
 * exercised on real controller records (see wlanFixtures.ts provenance).
 */
import { describe, expect, it } from 'vitest';
import {
  AUTH_TO_ELEMENT,
  WLAN_AUTH_TYPES,
  allows6GHz,
  authOptionsForHotspot,
  captivePortalLabel,
  deriveAuthType,
  hasPresharedKey,
  isEnterprise,
  isPureWpa3,
  isWpa,
  privacyLabel,
} from './wlanModel';
import { LAB_6GHZ, SKYNET, withPrivacy } from './wlanFixtures';

describe('deriveAuthType — privacy element is authoritative', () => {
  it('derives WPA2-Personal (PSK) from the real Skynet record', () => {
    expect(deriveAuthType(SKYNET)).toBe('WPA2-Personal (PSK)');
  });

  it('derives WPA3-Personal from the real LAB-6GHz record (parity gap #1)', () => {
    expect(deriveAuthType(LAB_6GHZ)).toBe('WPA3-Personal');
  });

  it.each([
    ['WepElement', 'WEP'],
    ['WpaSaePskElement', 'WPA3-Compatibility'],
    ['WpaEnterpriseElement', 'WPA2-Enterprise (802.1X/EAP)'],
    ['Dot1xElement', 'WPA2-Enterprise (802.1X/EAP)'],
    ['Wpa3EnterpriseElement', 'WPA3-Enterprise (802.1X/EAP)'],
    ['Wpa3EnterpriseTransitionElement', 'WPA3-Enterprise Transition (802.1X/EAP)'],
    ['Wpa3Enterprise192bElement', 'WPA3-Enterprise (192 Bits)'],
  ])('derives from %s', (element, expected) => {
    expect(deriveAuthType(withPrivacy(element, { pmfMode: 'enabled' }))).toBe(expected);
  });

  it('derives OWE from an OweElement', () => {
    expect(deriveAuthType(withPrivacy('OweElement', {}))).toBe('OWE');
  });

  it('derives OWE from privacy null + oweCompanion', () => {
    expect(deriveAuthType(withPrivacy(null, {}, { oweCompanion: 'some-id' }))).toBe('OWE');
  });

  it('derives Open from privacy null without a companion', () => {
    expect(deriveAuthType(withPrivacy(null))).toBe('Open');
  });

  it('derives Open for missing records', () => {
    expect(deriveAuthType(null)).toBe('Open');
    expect(deriveAuthType(undefined)).toBe('Open');
  });
});

describe('auth-type ↔ element mapping', () => {
  it('round-trips every persistable auth type through its element', () => {
    for (const auth of WLAN_AUTH_TYPES) {
      const element = AUTH_TO_ELEMENT[auth];
      if (!element) continue; // Open / OWE persist no dedicated element
      expect(deriveAuthType(withPrivacy(element, {}))).toBe(auth);
    }
  });
});

describe('hotspot mode filters the auth-type options', () => {
  const ENT3 = [
    'WPA2-Enterprise (802.1X/EAP)',
    'WPA3-Enterprise (802.1X/EAP)',
    'WPA3-Enterprise Transition (802.1X/EAP)',
  ];

  it('Enabled offers the 3 enterprise types', () => {
    expect(authOptionsForHotspot('Enabled')).toEqual(ENT3);
  });

  it('OSU offers Open + the 3 enterprise types', () => {
    expect(authOptionsForHotspot('Osu')).toEqual(['Open', ...ENT3]);
  });

  it('WBA OpenRoaming offers the 3 enterprise types', () => {
    expect(authOptionsForHotspot('OpenRoaming')).toEqual(ENT3);
  });

  it('Disabled offers the full controller list', () => {
    expect(authOptionsForHotspot('Disabled')).toEqual([...WLAN_AUTH_TYPES]);
  });
});

describe('auth classification helpers', () => {
  it('classifies enterprise / WPA / pure-WPA3 exactly', () => {
    expect(isEnterprise('WPA2-Enterprise (802.1X/EAP)')).toBe(true);
    expect(isEnterprise('WPA3-Personal')).toBe(false);
    expect(isWpa('WPA3-Compatibility')).toBe(true);
    expect(isWpa('WEP')).toBe(false);
    // Pure WPA3 pins PMF; Transition/Compatibility do not.
    expect(isPureWpa3('WPA3-Personal')).toBe(true);
    expect(isPureWpa3('WPA3-Enterprise (802.1X/EAP)')).toBe(true);
    expect(isPureWpa3('WPA3-Enterprise (192 Bits)')).toBe(true);
    expect(isPureWpa3('WPA3-Enterprise Transition (802.1X/EAP)')).toBe(false);
    expect(isPureWpa3('WPA3-Compatibility')).toBe(false);
  });

  it('gates 6 GHz on WPA3 / OWE and PSK entry on the three PSK types', () => {
    expect(allows6GHz('WPA3-Personal')).toBe(true);
    expect(allows6GHz('OWE')).toBe(true);
    expect(allows6GHz('WPA2-Personal (PSK)')).toBe(false);
    expect(hasPresharedKey('WPA2-Personal (PSK)')).toBe(true);
    expect(hasPresharedKey('WPA3-Compatibility')).toBe(true);
    expect(hasPresharedKey('WPA2-Enterprise (802.1X/EAP)')).toBe(false);
  });
});

describe('grid label getters', () => {
  it('renders the derived privacy label for live records', () => {
    expect(privacyLabel(LAB_6GHZ)).toBe('WPA3-Personal');
    expect(privacyLabel(SKYNET)).toBe('WPA2-Personal (PSK)');
  });

  it('renders captive portal labels from the enum', () => {
    expect(captivePortalLabel(SKYNET)).toBe('Disabled');
    expect(
      captivePortalLabel(
        withPrivacy(null, {}, { enableCaptivePortal: true, captivePortalType: 'EGuest' })
      )
    ).toBe('Extreme Guest');
  });
});
