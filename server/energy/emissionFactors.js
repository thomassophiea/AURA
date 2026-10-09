/**
 * Grid emission factors for converting kWh to kg CO2e.
 *
 * SOURCE: EPA eGRID2023, published January 2025 — Summary Tables, Table 1,
 * Subregion Output Emission Rates — as distributed in the EPA GHG Emission
 * Factors Hub 2025 (Table 6, Electricity), with the CO2e column supplied by
 * Supply Chain Technical Operations (2026-10-07):
 *   https://www.epa.gov/system/files/documents/2025-01/egrid2023_summary_tables.xlsx
 *
 * WHICH COLUMN, AND WHY
 * ---------------------
 * `totalLbCo2ePerMwh` is the TOTAL OUTPUT rate, CO2 equivalent. EPA's note on
 * the table: total output factors "can be used as default factors for
 * estimating GHG emissions from electricity use when developing a carbon
 * footprint or emissions inventory". That is what AURA reports, and it is the
 * column Supply Chain asked us to use.
 *
 * `nonBaseloadLbCo2ePerMwh` is carried for transparency only. EPA: non-baseload
 * factors "should not be used when developing a carbon footprint … but can be
 * used to estimate GHG emissions reductions on the grid from changes in
 * electricity use". The source table gives non-baseload CO2/CH4/N2O but no CO2e,
 * so it is computed here with the same GWPs that reproduce the supplied total
 * CO2e column exactly (AR5: CH4 = 28, N2O = 265; e.g. CAMX 436.655 + 0.025×28 +
 * 0.003×265 = 438.150).
 *
 * eGRID factors are per SUBREGION, not per state — a state can span several
 * subregions, and EPA assigns a location by ZIP code. AURA therefore asks the
 * operator to choose the subregion rather than guessing one from a state.
 *
 * Country-level factors (IEA, g CO2e/kWh) are not bundled: no table was
 * supplied. Non-US sites enter a factor and its source by hand.
 */

export const EGRID_SOURCE = 'EPA eGRID2023 (Jan 2025), total output emission rate, CO2e';
export const EGRID_YEAR = 2023;

const GWP_CH4 = 28;
const GWP_N2O = 265;
const KG_PER_LB = 0.45359237;

// [code, name, total CO2e lb/MWh, non-baseload CO2, CH4, N2O lb/MWh]
const ROWS = [
  ['AKGD', 'ASCC Alaska Grid', 904.591, 1077.11, 0.116, 0.016],
  ['AKMS', 'ASCC Miscellaneous', 521.233, 1548.607, 0.067, 0.012],
  ['AZNM', 'WECC Southwest', 743.548, 1260.436, 0.067, 0.009],
  ['CAMX', 'WECC California', 438.15, 1033.985, 0.051, 0.007],
  ['ERCT', 'ERCOT All', 740.832, 1264.939, 0.076, 0.01],
  ['FRCC', 'FRCC All', 804.392, 1033.954, 0.045, 0.006],
  ['HIMS', 'HICC Miscellaneous', 1132.035, 1596.385, 0.17, 0.027],
  ['HIOA', 'HICC Oahu', 1498.679, 1753.441, 0.159, 0.025],
  ['MROE', 'MRO East', 1409.758, 1713.772, 0.161, 0.023],
  ['MROW', 'MRO West', 926.448, 1776.58, 0.18, 0.026],
  ['NEWE', 'NPCC New England', 541.127, 885.161, 0.067, 0.009],
  ['NWPP', 'WECC Northwest', 635.337, 1613.426, 0.146, 0.021],
  ['NYCW', 'NPCC NYC/Westchester', 976.151, 1008.891, 0.02, 0.002],
  ['NYLI', 'NPCC Long Island', 1189.368, 1316.557, 0.05, 0.006],
  ['NYUP', 'NPCC Upstate NY', 241.563, 909.108, 0.041, 0.005],
  ['PRMS', 'Puerto Rico Miscellaneous', 1548.288, 1636.738, 0.072, 0.012],
  ['RFCE', 'RFC East', 597.073, 1175.499, 0.077, 0.01],
  ['RFCM', 'RFC Michigan', 967.295, 1508.119, 0.144, 0.02],
  ['RFCW', 'RFC West', 915.959, 1757.345, 0.161, 0.023],
  ['RMPA', 'WECC Rockies', 1041.986, 1620.64, 0.124, 0.018],
  ['SPNO', 'SPP North', 867.541, 1892.091, 0.188, 0.027],
  ['SPSO', 'SPP South', 894.763, 1508.425, 0.095, 0.013],
  ['SRMV', 'SERC Mississippi Valley', 741.371, 1145.487, 0.061, 0.008],
  ['SRMW', 'SERC Midwest', 1247.042, 1818.554, 0.19, 0.027],
  ['SRSO', 'SERC South', 844.553, 1385.997, 0.096, 0.014],
  ['SRTV', 'SERC Tennessee Valley', 900.82, 1665.755, 0.154, 0.022],
  ['SRVC', 'SERC Virginia/Carolina', 593.079, 1286.77, 0.1, 0.014],
  ['US', 'US Average', 775.239, 1393.7, 0.104, 0.015],
];

/** lb/MWh -> kg/kWh. */
export function lbPerMwhToKgPerKwh(lbPerMwh) {
  return (lbPerMwh * KG_PER_LB) / 1000;
}

export const EGRID_SUBREGIONS = Object.freeze(
  ROWS.map(([code, name, total, nbCo2, nbCh4, nbN2o]) => {
    const nonBaseload = nbCo2 + nbCh4 * GWP_CH4 + nbN2o * GWP_N2O;
    return Object.freeze({
      code,
      name,
      totalLbCo2ePerMwh: total,
      kgCo2ePerKwh: Number(lbPerMwhToKgPerKwh(total).toFixed(6)),
      nonBaseloadLbCo2ePerMwh: Number(nonBaseload.toFixed(3)),
      nonBaseloadKgCo2ePerKwh: Number(lbPerMwhToKgPerKwh(nonBaseload).toFixed(6)),
    });
  })
);

const BY_CODE = new Map(EGRID_SUBREGIONS.map((row) => [row.code, row]));

export function egridSubregion(code) {
  return BY_CODE.get(String(code ?? '').trim().toUpperCase()) ?? null;
}

/** The US average, used wherever a default factor is needed. ≈ 0.3516 kg/kWh. */
export const US_AVERAGE = egridSubregion('US');

/**
 * The preference fields a subregion preset resolves to. The server fills these
 * from the table so a factor can never be saved with the wrong source or year.
 */
export function presetPreferenceFields(code) {
  const row = egridSubregion(code);
  if (!row) return null;
  return {
    emissionsFactorKgPerKwh: row.kgCo2ePerKwh,
    emissionsFactorSource: EGRID_SOURCE,
    emissionsFactorRegion: `eGRID ${row.code} — ${row.name}`,
    emissionsFactorYear: EGRID_YEAR,
  };
}
