import { describe, it, expect } from 'vitest';
import { capabilitiesForModel, supportsLightSensor } from './apCapabilities.js';

describe('capabilitiesForModel', () => {
  it('flags ambient light sensor on Wi-Fi 7 JSA-1141 models', () => {
    expect(supportsLightSensor('AP5020')).toBe(true);
    expect(capabilitiesForModel('AP5020').ambientLightSensor).toBe(true);
  });

  it('matches case-insensitively and on descriptive strings', () => {
    expect(supportsLightSensor('ap5020')).toBe(true);
    expect(supportsLightSensor('Extreme AP5020 Wi-Fi 7')).toBe(true);
  });

  it('does not flag older models without the sensor', () => {
    expect(supportsLightSensor('AP4020X')).toBe(false);
    expect(supportsLightSensor('AP505')).toBe(false);
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
