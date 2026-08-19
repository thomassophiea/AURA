import { describe, it, expect } from 'vitest';
import { supportsLightSensor } from './apCapabilities';

describe('supportsLightSensor', () => {
  it('flags confirmed sensor families', () => {
    expect(supportsLightSensor('AP5020')).toBe(true);
    expect(supportsLightSensor('ap4020x')).toBe(true);
    expect(supportsLightSensor('AP4060X')).toBe(true);
  });
  it('rejects non-sensor and unknown models', () => {
    expect(supportsLightSensor('AP4000')).toBe(false);
    expect(supportsLightSensor(undefined)).toBe(false);
  });
});
