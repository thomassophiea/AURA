import { describe, it, expect } from 'vitest';
import { capabilitiesForModel, supportsLightSensor } from './apCapabilities.js';

describe('capabilitiesForModel', () => {
  it('flags the ambient light sensor on every confirmed sensor family', () => {
    for (const model of ['AP4020', 'AP4020X', 'AP4020FX', 'AP4060', 'AP4060X', 'AP5020']) {
      expect(supportsLightSensor(model)).toBe(true);
      expect(capabilitiesForModel(model).ambientLightSensor).toBe(true);
    }
  });

  it('matches case-insensitively and on descriptive strings', () => {
    expect(supportsLightSensor('ap5020')).toBe(true);
    expect(supportsLightSensor('Extreme AP4060X Wi-Fi 7')).toBe(true);
  });

  it('does not flag models without the sensor', () => {
    expect(supportsLightSensor('AP4000')).toBe(false);
    expect(supportsLightSensor('AP505')).toBe(false);
    expect(supportsLightSensor('AP3000')).toBe(false);
  });

  it('defaults unknown models to no sensor and conservative capabilities', () => {
    const caps = capabilitiesForModel('SomeFutureAP9999');
    expect(caps.ambientLightSensor).toBe(false);
    expect(caps.radioEnableDisable).toBe(false);
  });

  it('handles null/empty model safely', () => {
    expect(supportsLightSensor(null)).toBe(false);
    expect(supportsLightSensor('')).toBe(false);
  });
});
