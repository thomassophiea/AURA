import { describe, it, expect } from 'vitest';
import { analyzeRfCapacity } from './rfCapacityAnalyzer.js';

function makeProfile(name, ssidCountOnRadio1, hasRadio6Ghz = false) {
  const radioIfList = Array.from({ length: ssidCountOnRadio1 }, (_, i) => ({
    serviceId: `svc-${i}`,
    index: 1,
  }));
  const radios = [
    { radioName: 'Radio 1 - 2.4 GHz', adminState: true, index: 1 },
    { radioName: 'Radio 2 - 5 GHz', adminState: true, index: 2 },
    ...(hasRadio6Ghz ? [{ radioName: 'Radio 3 - 6 GHz', adminState: true, index: 3 }] : []),
  ];
  return { name, radioIfList, radios };
}

describe('analyzeRfCapacity', () => {
  it('returns pass for profiles with headroom', () => {
    const profiles = [makeProfile('Site-A', 4), makeProfile('Site-B', 3)];
    const { ssidResult } = analyzeRfCapacity(profiles, 'WPA2-PSK');
    expect(ssidResult.result).toBe('pass');
  });

  it('returns warn when a profile has 7 SSIDs on a radio', () => {
    const profiles = [makeProfile('Site-A', 7)];
    const { ssidResult } = analyzeRfCapacity(profiles, 'WPA2-PSK');
    expect(ssidResult.result).toBe('warn');
    expect(ssidResult.evidence).toContain('Site-A');
  });

  it('returns block when a profile has 8 SSIDs on a radio', () => {
    const profiles = [makeProfile('Site-A', 8)];
    const { ssidResult } = analyzeRfCapacity(profiles, 'WPA2-PSK');
    expect(ssidResult.result).toBe('block');
    expect(ssidResult.evidence).toContain('8/8');
  });

  it('returns band warn when WPA2-PSK targets a profile with a 6GHz radio', () => {
    const profiles = [makeProfile('Site-A', 2, true)];
    const { bandResult } = analyzeRfCapacity(profiles, 'WPA2-PSK');
    expect(bandResult.result).toBe('warn');
    expect(bandResult.evidence).toContain('6 GHz');
  });

  it('returns band pass when WPA3-SAE targets a profile with a 6GHz radio', () => {
    const profiles = [makeProfile('Site-A', 2, true)];
    const { bandResult } = analyzeRfCapacity(profiles, 'WPA3-SAE');
    expect(bandResult.result).toBe('pass');
  });

  it('returns pass for empty profile list', () => {
    const { ssidResult } = analyzeRfCapacity([], 'WPA2-PSK');
    expect(ssidResult.result).toBe('pass');
  });
});
