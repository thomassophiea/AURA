/**
 * Smart RF Auto Sensor (Gateway 10.20) — the Band24 exclusion/fallback rule
 * the Gateway applies to autoSensorBandOptions while Select Shutdown is on.
 */
import { describe, expect, it } from 'vitest';
import { RF_TABS_SMART, autoSensorBandOpts, autoSensorBandValue } from './rfModel';

describe('rfModel Auto Sensor (10.20)', () => {
  it('is part of the Smart RF tab set', () => {
    expect(RF_TABS_SMART).toContain('Auto Sensor');
  });

  it('offers all three bands while Select Shutdown is off', () => {
    expect(autoSensorBandOpts(false).map((b) => b.id)).toEqual(['Band5', 'Band24', 'Band6']);
  });

  it('removes Band24 from the options while Select Shutdown is on', () => {
    expect(autoSensorBandOpts(true).map((b) => b.id)).toEqual(['Band5', 'Band6']);
  });

  it('falls an existing Band24 value back to Band5 while Select Shutdown is on', () => {
    expect(autoSensorBandValue('Band24', true)).toBe('Band5');
    expect(autoSensorBandValue('2.4GHZ', true)).toBe('Band5');
  });

  it('keeps Band24 while Select Shutdown is off, and other bands always', () => {
    expect(autoSensorBandValue('Band24', false)).toBe('Band24');
    expect(autoSensorBandValue('Band6', true)).toBe('Band6');
  });

  it('defaults a missing band to Band5', () => {
    expect(autoSensorBandValue(undefined, false)).toBe('Band5');
    expect(autoSensorBandValue('', true)).toBe('Band5');
  });
});
