import { describe, it, expect } from 'vitest';
import {
  EGRID_SUBREGIONS,
  egridSubregion,
  US_AVERAGE,
  presetPreferenceFields,
  lbPerMwhToKgPerKwh,
  EGRID_SOURCE,
} from './emissionFactors.js';

describe('eGRID2023 table', () => {
  it('carries all 27 subregions plus the US average', () => {
    expect(EGRID_SUBREGIONS).toHaveLength(28);
  });

  it('converts lb/MWh to kg/kWh', () => {
    expect(lbPerMwhToKgPerKwh(1000)).toBeCloseTo(0.45359237, 8);
  });

  it('US average total-output CO2e is 775.239 lb/MWh = 0.3516 kg/kWh', () => {
    expect(US_AVERAGE.totalLbCo2ePerMwh).toBe(775.239);
    expect(US_AVERAGE.kgCo2ePerKwh).toBeCloseTo(0.35164, 5);
  });

  it('non-baseload CO2e uses the GWPs that reproduce the supplied total CO2e column', () => {
    // Supplied: CAMX total CO2 436.655, CH4 0.025, N2O 0.003 -> CO2e 438.150.
    expect(436.655 + 0.025 * 28 + 0.003 * 265).toBeCloseTo(egridSubregion('CAMX').totalLbCo2ePerMwh, 3);
    // Same GWPs applied to CAMX non-baseload 1033.985 / 0.051 / 0.007.
    expect(egridSubregion('CAMX').nonBaseloadLbCo2ePerMwh).toBeCloseTo(1033.985 + 0.051 * 28 + 0.007 * 265, 3);
  });

  it('spot-checks rows against the sheet', () => {
    expect(egridSubregion('NYUP').totalLbCo2ePerMwh).toBe(241.563); // cleanest
    expect(egridSubregion('PRMS').totalLbCo2ePerMwh).toBe(1548.288); // dirtiest
    expect(egridSubregion('newe').name).toBe('NPCC New England');
    expect(egridSubregion('XXXX')).toBeNull();
  });

  it('a preset resolves to factor, source, region and year together', () => {
    expect(presetPreferenceFields('RFCE')).toEqual({
      emissionsFactorKgPerKwh: egridSubregion('RFCE').kgCo2ePerKwh,
      emissionsFactorSource: EGRID_SOURCE,
      emissionsFactorRegion: 'eGRID RFCE — RFC East',
      emissionsFactorYear: 2023,
    });
    expect(presetPreferenceFields('nope')).toBeNull();
  });
});
