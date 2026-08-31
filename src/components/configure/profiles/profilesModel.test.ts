/**
 * Gateway 10.20 delta + PLM-ruling coverage for the Device Profiles editor
 * model: TAF gating, the Beamforming (txBf) authoring removal with round-trip
 * preservation, Operational Mode verbiage + radio re-plan, and the Selective
 * DNS Interception FQDN rule.
 */
import { describe, expect, it } from 'vitest';
import { ADV_RADIO_FIELDS, RE_SEL_DNS, opModeText } from './constants';
import { replanRadios, selDnsError } from './helpers';
import type { ApProfile, ProfileRadio } from '../../../types/configure';

const radio = (over: Partial<ProfileRadio> = {}): ProfileRadio =>
  ({
    radioName: 'Radio 1',
    radioIndex: 1,
    mode: 'gnxbe',
    adminState: true,
    txBf: 'muMimo',
    supportedModes: ['gn', 'gnx', 'gnxbe'],
    ...over,
  }) as ProfileRadio;

describe('ADV_RADIO_FIELDS — Gateway 10.20 + PLM rulings', () => {
  it('carries NO Beamforming (txBf) row — PLM 2026-08-26', () => {
    expect(ADV_RADIO_FIELDS.some((f) => f.key === 'txBf')).toBe(false);
  });

  it('places TAF immediately after Airtime Fairness', () => {
    const keys = ADV_RADIO_FIELDS.map((f) => f.key);
    const atf = keys.indexOf('atf');
    expect(atf).toBeGreaterThanOrEqual(0);
    expect(keys[atf + 1]).toBe('taf');
  });

  it('gates TAF on the CELL-SIZE-CONTROL feature tag', () => {
    const taf = ADV_RADIO_FIELDS.find((f) => f.key === 'taf');
    expect(taf).toBeDefined();
    expect(taf!.type).toBe('bool');
    const withTag = (t: string) => t === 'CELL-SIZE-CONTROL';
    const withoutTag = () => false;
    expect(taf!.show(radio(), withTag)).toBe(true);
    expect(taf!.show(radio(), withoutTag)).toBe(false);
  });
});

describe('txBf round-trip preservation', () => {
  it('replanRadios never strips the txBf field from a radio', () => {
    const draft = {
      operatingMode: 'SERVICE_2_5_6',
      radios: [radio({ txBf: 'dlUlMuMimo' })],
      supportedOperatingModes: [
        {
          id: 'SENSOR_SERVICE_2_5_6',
          radios: [{ id: 1, defaultProtocol: 'gnxbe', band: 'BAND2', supportedProtocols: ['gnxbe'] }],
        },
      ],
    } as unknown as ApProfile;
    replanRadios(draft, 'SENSOR_SERVICE_2_5_6');
    expect(draft.radios[0].txBf).toBe('dlUlMuMimo');
  });
});

describe('replanRadios (updateRadios + setDropdownMode + setRadioBandsTitles)', () => {
  const draft = () =>
    ({
      operatingMode: 'A',
      radios: [
        radio({ radioIndex: 1, mode: 'gn', supportedModes: ['gn', 'gnx'] }),
        radio({ radioIndex: 2, radioName: 'Radio 2', mode: 'ancx', supportedModes: ['anc', 'ancx'] }),
      ],
      supportedOperatingModes: [
        {
          id: 'B',
          radios: [
            { id: 1, defaultProtocol: 'gnxbe', band: 'BAND2', supportedProtocols: ['bg', 'gnxbe'] },
            { id: 2, defaultProtocol: 'ancxbe', band: 'BAND5HIGH', supportedProtocols: ['anc', 'ancx', 'ancxbe'] },
          ],
        },
      ],
    }) as unknown as ApProfile;

  it('replaces supportedModes from the chosen mode plan', () => {
    const d = draft();
    replanRadios(d, 'B');
    expect(d.operatingMode).toBe('B');
    expect(d.radios[0].supportedModes).toEqual(['bg', 'gnxbe']);
  });

  it('resets a disallowed protocol to the plan defaultProtocol, keeps an allowed one', () => {
    const d = draft();
    replanRadios(d, 'B');
    expect(d.radios[0].mode).toBe('gnxbe'); // 'gn' is not in the new list
    expect(d.radios[1].mode).toBe('ancx'); // still allowed
  });

  it('re-titles each radio from its band (radioBandsKeys)', () => {
    const d = draft();
    replanRadios(d, 'B');
    expect(d.radios[0].radioName).toBe('Radio 1 - 2.4 GHz');
    expect(d.radios[1].radioName).toBe('Radio 2 - 5 GHz H');
  });

  it('is a no-op (besides the mode) when the plan is unknown', () => {
    const d = draft();
    replanRadios(d, 'MISSING');
    expect(d.operatingMode).toBe('MISSING');
    expect(d.radios[0].mode).toBe('gn');
  });
});

describe('opModeText — controller verbiage (operatingModes map)', () => {
  it('maps known modes to the Gateway strings', () => {
    expect(opModeText('SERVICE_2_5_6')).toBe('2.4/5/6 GHz');
    expect(opModeText('SENSOR_SERVICE_2_5_6')).toBe('2.4/5/6 GHz');
    expect(opModeText('SENSOR_SERVICE_5_6')).toBe('5/6 GHz + Sensor');
  });
  it('renders GENERIC as an em dash and unmapped ids as Unknown', () => {
    expect(opModeText('GENERIC')).toBe('—');
    expect(opModeText('SOMETHING_NEW')).toBe('Unknown');
  });
  it('renders empty for a missing value', () => {
    expect(opModeText(null)).toBe('');
    expect(opModeText(undefined)).toBe('');
  });
});

describe('Selective DNS Interception (selDnsIntercept, Gateway 10.20)', () => {
  it('accepts an empty value and a valid FQDN', () => {
    expect(selDnsError('')).toBe(false);
    expect(selDnsError(null)).toBe(false);
    expect(selDnsError('example.com')).toBe(false);
    expect(selDnsError('portal.corp.example.co')).toBe(false);
  });
  it('rejects non-FQDN values with the controller pattern', () => {
    expect(selDnsError('not a domain')).toBe(true);
    expect(selDnsError('-leadinghyphen.com')).toBe(true);
    expect(selDnsError('nodot')).toBe(true);
    expect(RE_SEL_DNS.test('example.com')).toBe(true);
  });
});
