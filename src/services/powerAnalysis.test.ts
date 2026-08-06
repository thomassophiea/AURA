import { describe, it, expect } from 'vitest';
import { buildPowerContext, derivePowerLevers } from './powerAnalysis';
import { AP5020_INSIGHTS_3H, SPIKE_TIMESTAMP } from '../test/fixtures/apInsights.fixture';
import { AP5020_DETAILS } from '../test/fixtures/apDetails.fixture';
import type { APDetails, APInsightsResponse } from '../types/api';

/** Minimal insights response carrying only a power series, for edge cases. */
function powerOnly(
  samples: Array<[number, string]>,
  unit = 'mW'
): APInsightsResponse {
  return {
    apPowerConsumptionTimeseries: [
      {
        reportName: 'Power Consumption',
        reportType: '',
        fromTimeInMillis: 0,
        toTimeInMillis: 0,
        statistics: [
          {
            statName: 'Power Consumption',
            type: 'number',
            unit,
            values: samples.map(([timestamp, value]) => ({ timestamp, value })),
          },
        ],
      },
    ],
  } as unknown as APInsightsResponse;
}

describe('powerAnalysis', () => {
  describe('unit conversion', () => {
    it('converts mW to watts, the unit the controller actually reports', () => {
      const ctx = buildPowerContext(
        powerOnly([
          [1000, '13000'],
          [2000, '14000'],
          [3000, '18670'],
        ]),
        3000
      );

      // 18670 mW is 18.67 W — not 18670 W, which is what reading the raw value
      // as watts produced on the AP Insights chart.
      expect(ctx?.powerW).toBeCloseTo(18.67, 2);
      expect(ctx?.window.floorW).toBeCloseTo(13, 2);
      expect(ctx?.window.baselineW).toBeCloseTo(14, 2);
    });

    it('leaves watts untouched when the controller reports W', () => {
      const ctx = buildPowerContext(
        powerOnly(
          [
            [1000, '13'],
            [2000, '14'],
            [3000, '18.67'],
          ],
          'W'
        ),
        3000
      );
      expect(ctx?.powerW).toBeCloseTo(18.67, 2);
    });

    it('tolerates unit casing and padding', () => {
      const ctx = buildPowerContext(
        powerOnly([[1000, '13000'], [2000, '14000'], [3000, '15000']], ' Mw '),
        3000
      );
      expect(ctx?.powerW).toBeCloseTo(15, 2);
    });

    it('passes through an unrecognised unit rather than guessing at a scale', () => {
      const ctx = buildPowerContext(
        powerOnly([[1000, '13'], [2000, '14'], [3000, '15']], 'dBm'),
        3000
      );
      expect(ctx?.powerW).toBe(15);
    });
  });

  describe('live AP5020 capture', () => {
    it('reports the spike in watts, not milliwatts', () => {
      const ctx = buildPowerContext(AP5020_INSIGHTS_3H, SPIKE_TIMESTAMP);
      expect(ctx).not.toBeNull();
      expect(ctx?.powerW).toBeCloseTo(18.67, 2);
    });

    it('derives the window floor and baseline from measured samples', () => {
      const ctx = buildPowerContext(AP5020_INSIGHTS_3H, SPIKE_TIMESTAMP);
      expect(ctx?.window.sampleCount).toBe(90);
      expect(ctx?.window.floorW).toBeCloseTo(13.532, 2);
      expect(ctx?.window.baselineW).toBeCloseTo(14.07, 1);
      expect(ctx?.window.peakW).toBeCloseTo(18.67, 2);
    });

    it('puts the spike at roughly +33% over baseline', () => {
      const ctx = buildPowerContext(AP5020_INSIGHTS_3H, SPIKE_TIMESTAMP);
      expect(ctx?.deltaPercent).toBeGreaterThan(30);
      expect(ctx?.deltaPercent).toBeLessThan(36);
      expect(ctx?.percentile).toBe(100);
    });

    it('calls the spike unexplained — no available series accounts for it', () => {
      const ctx = buildPowerContext(AP5020_INSIGHTS_3H, SPIKE_TIMESTAMP);
      expect(ctx?.verdict).toBe('unexplained');
      expect(ctx?.verdictDetail).toContain('no per-radio tx power');
    });

    it('finds no correlated series above the explanation threshold', () => {
      const ctx = buildPowerContext(AP5020_INSIGHTS_3H, SPIKE_TIMESTAMP);
      const strong = (ctx?.movements ?? []).filter(
        (m) => m.correlation !== null && Math.abs(m.correlation) >= 0.5
      );
      // Strongest observed correlate on this capture is ~0.29 (clients / co-channel).
      expect(strong).toHaveLength(0);
    });

    it('classifies the single-sample spike as transient', () => {
      const ctx = buildPowerContext(AP5020_INSIGHTS_3H, SPIKE_TIMESTAMP);
      expect(ctx?.persistence).toBe('transient');
      expect(ctx?.persistenceSamples).toBe(1);
    });

    it('omits the all-null series instead of charting them as zero', () => {
      const ctx = buildPowerContext(AP5020_INSIGHTS_3H, SPIKE_TIMESTAMP);
      const keys = (ctx?.movements ?? []).map((m) => m.key);

      // Interference / ClientData / Available come back as the string "null" on
      // XCC 10.18.1.0-011R. A flat zero line would read as a real measurement.
      expect(keys).not.toContain('channelUtilization5.Interference');
      expect(keys).not.toContain('channelUtilization5.ClientData');
      expect(keys).not.toContain('channelUtilization2_4.Interference');

      // CoChannel does have data and must survive.
      expect(keys).toContain('channelUtilization5.CoChannel');
      expect(keys).toContain('throughputReport.Total');
      expect(keys).toContain('countOfUniqueUsersReport.tntUniqueUsers');
    });

    it('does not let the quantised noise floor outrank a real throughput spike', () => {
      const ctx = buildPowerContext(AP5020_INSIGHTS_3H, SPIKE_TIMESTAMP);
      const noise = ctx?.movements.find((m) => m.key === 'noisePerRadio.R1');

      // R1 reports only -100 and -99 dBm across the window. A 1 dBm step there
      // scored z=2.45 and outranked Download's genuine 3.4 Mbps jump.
      expect(noise).toBeDefined();
      expect(noise?.zScore).toBeNull();
      expect(ctx?.movements[0]?.key).toBe('throughputReport.Download');
    });

    it('still reports the value and delta of an unrankable series', () => {
      const ctx = buildPowerContext(AP5020_INSIGHTS_3H, SPIKE_TIMESTAMP);
      const noise = ctx?.movements.find((m) => m.key === 'noisePerRadio.R1');
      expect(noise?.value).toBe(-99);
      expect(noise?.unit).toBe('dBm');
      expect(noise?.delta).toBeCloseTo(1, 5);
    });

    it('names only the genuinely unusual series in the verdict', () => {
      const ctx = buildPowerContext(AP5020_INSIGHTS_3H, SPIKE_TIMESTAMP);
      expect(ctx?.verdictDetail).toContain('Download');
      expect(ctx?.verdictDetail).not.toContain('Noise radio');
    });

    it('ranks movements by absolute z-score, descending', () => {
      const ctx = buildPowerContext(AP5020_INSIGHTS_3H, SPIKE_TIMESTAMP);
      const scores = (ctx?.movements ?? []).map((m) => Math.abs(m.zScore ?? 0));
      const sorted = [...scores].sort((a, b) => b - a);
      expect(scores).toEqual(sorted);
    });

    it('snaps a between-samples timestamp to the nearest real sample', () => {
      const ctx = buildPowerContext(AP5020_INSIGHTS_3H, SPIKE_TIMESTAMP + 30_000);
      expect(ctx?.timestamp).toBe(SPIKE_TIMESTAMP);
      expect(ctx?.powerW).toBeCloseTo(18.67, 2);
    });

    it('reports a quiet point as nominal rather than inventing a cause', () => {
      // First sample of the capture sits close to the window median.
      const ctx = buildPowerContext(AP5020_INSIGHTS_3H, 1785961920000);
      expect(ctx?.verdict).toBe('nominal');
      expect(ctx?.verdictDetail).toContain('Normal variation');
    });
  });

  describe('verdicts', () => {
    it('returns insufficient-data below three samples', () => {
      const ctx = buildPowerContext(
        powerOnly([
          [1000, '13000'],
          [2000, '18000'],
        ]),
        2000
      );
      expect(ctx?.verdict).toBe('insufficient-data');
      expect(ctx?.verdictDetail).toContain('2 power samples');
    });

    it('says explained when a correlated series also moves at the point', () => {
      // Power and throughput rise together across the window, and both jump at
      // the final sample — a genuine explanation.
      const timestamps = Array.from({ length: 20 }, (_, i) => (i + 1) * 1000);
      const powerVals = timestamps.map((_, i) => (i === 19 ? 20000 : 13000 + i * 100));
      const tputVals = timestamps.map((_, i) => (i === 19 ? 90_000_000 : 1_000_000 + i * 100_000));

      const insights = {
        apPowerConsumptionTimeseries: [
          {
            reportName: 'Power Consumption',
            statistics: [
              {
                statName: 'Power Consumption',
                unit: 'mW',
                values: timestamps.map((t, i) => ({ timestamp: t, value: String(powerVals[i]) })),
              },
            ],
          },
        ],
        throughputReport: [
          {
            reportName: 'Throughput',
            statistics: [
              {
                statName: 'Total',
                unit: 'bps',
                values: timestamps.map((t, i) => ({ timestamp: t, value: String(tputVals[i]) })),
              },
            ],
          },
        ],
      } as unknown as APInsightsResponse;

      const ctx = buildPowerContext(insights, 20000);
      expect(ctx?.verdict).toBe('explained');
      expect(ctx?.verdictDetail).toContain('Total throughput');
    });

    it('detects a sustained elevation across consecutive samples', () => {
      const samples: Array<[number, string]> = [
        [1000, '13000'],
        [2000, '13000'],
        [3000, '13000'],
        [4000, '13000'],
        [5000, '18000'],
        [6000, '18000'],
        [7000, '18000'],
        [8000, '13000'],
      ];
      const ctx = buildPowerContext(powerOnly(samples), 6000);
      expect(ctx?.persistence).toBe('sustained');
      expect(ctx?.persistenceSamples).toBe(3);
    });
  });

  describe('edge cases', () => {
    it('returns null without insights', () => {
      expect(buildPowerContext(null, 1000)).toBeNull();
    });

    it('returns null without a locked timestamp', () => {
      expect(buildPowerContext(AP5020_INSIGHTS_3H, null)).toBeNull();
    });

    it('returns null when the power report is absent', () => {
      expect(buildPowerContext({} as APInsightsResponse, 1000)).toBeNull();
    });

    it('returns null when every power reading is non-numeric', () => {
      const ctx = buildPowerContext(
        powerOnly([
          [1000, 'null'],
          [2000, 'null'],
        ]),
        2000
      );
      expect(ctx).toBeNull();
    });

    it('handles a single sample without dividing by zero', () => {
      const ctx = buildPowerContext(powerOnly([[1000, '13000']]), 1000);
      expect(ctx?.powerW).toBeCloseTo(13, 2);
      expect(ctx?.deltaW).toBe(0);
      expect(ctx?.deltaPercent).toBe(0);
      expect(ctx?.verdict).toBe('insufficient-data');
    });

    it('gives a flat series a null z-score rather than Infinity', () => {
      const timestamps = [1000, 2000, 3000, 4000];
      const insights = {
        apPowerConsumptionTimeseries: [
          {
            statistics: [
              {
                statName: 'Power Consumption',
                unit: 'mW',
                values: timestamps.map((t, i) => ({
                  timestamp: t,
                  value: String(13000 + i * 500),
                })),
              },
            ],
          },
        ],
        countOfUniqueUsersReport: [
          {
            statistics: [
              {
                statName: 'tntUniqueUsers',
                unit: 'users',
                values: timestamps.map((t) => ({ timestamp: t, value: '5' })),
              },
            ],
          },
        ],
      } as unknown as APInsightsResponse;

      const ctx = buildPowerContext(insights, 4000);
      const clients = ctx?.movements.find((m) => m.key === 'countOfUniqueUsersReport.tntUniqueUsers');
      expect(clients).toBeDefined();
      expect(clients?.zScore).toBeNull();
      expect(clients?.correlation).toBeNull();
    });
  });

  describe('derivePowerLevers', () => {
    it('returns nothing without AP details', () => {
      expect(derivePowerLevers(null)).toEqual([]);
    });

    it('flags wide channels on the live AP5020 config', () => {
      const levers = derivePowerLevers(AP5020_DETAILS);
      const widths = levers.filter((l) => l.id.endsWith('-width'));

      // Radios are at 20 / 40 / 80 MHz — the 40 and 80 are actionable, 20 is not.
      expect(widths).toHaveLength(2);
      expect(widths.map((l) => l.currentValue).sort()).toEqual(['40 MHz', '80 MHz']);
      expect(widths.every((l) => !l.alreadyOptimal)).toBe(true);
    });

    it('maps radio modes to the right bands', () => {
      const levers = derivePowerLevers(AP5020_DETAILS);
      const labels = levers.map((l) => l.label);
      // gnxbe -> 2.4, ancxbe -> 5, ax6be -> 6
      expect(labels).toContain('5 GHz channel width');
      expect(labels).toContain('6 GHz channel width');
      expect(labels).toContain('2.4 GHz radio');
    });

    it('marks the already-off levers as optimal instead of hiding them', () => {
      const levers = derivePowerLevers(AP5020_DETAILS);
      const byId = new Map(levers.map((l) => [l.id, l]));

      // usb/pse off, iot disabled, autoTxPowerMin on, forcePoEPlus off on this AP.
      expect(byId.get('usb-power')?.alreadyOptimal).toBe(true);
      expect(byId.get('pse-power')?.alreadyOptimal).toBe(true);
      expect(byId.get('iot-radio')?.alreadyOptimal).toBe(true);
      expect(byId.get('auto-tx-power-min')?.alreadyOptimal).toBe(true);
      expect(byId.get('force-poe-plus')?.alreadyOptimal).toBe(true);

      // LED is NORMAL, so dimming it is still on the table.
      expect(byId.get('led-status')?.alreadyOptimal).toBe(false);
    });

    it('leaves the trade-off blank for levers already at their lowest setting', () => {
      const levers = derivePowerLevers(AP5020_DETAILS);
      for (const lever of levers.filter((l) => l.alreadyOptimal)) {
        expect(lever.tradeOff).toBe('');
      }
    });

    it('names the cost of every actionable lever', () => {
      const levers = derivePowerLevers(AP5020_DETAILS);
      const actionable = levers.filter((l) => !l.alreadyOptimal);
      expect(actionable.length).toBeGreaterThan(0);
      for (const lever of actionable) {
        expect(lever.tradeOff.length).toBeGreaterThan(0);
      }
    });

    it('carries no watt estimate, since none can be measured', () => {
      const levers = derivePowerLevers(AP5020_DETAILS);
      for (const lever of levers) {
        expect(lever).not.toHaveProperty('estimatedSavingsW');
      }
    });

    it('surfaces levers that are switched on as actionable', () => {
      const hungry = {
        ...AP5020_DETAILS,
        usbPower: 'On',
        psePower: 'Auto',
        iotEnabled: true,
        autoTxPowerMin: false,
        forcePoEPlus: true,
      } as APDetails;

      const byId = new Map(derivePowerLevers(hungry).map((l) => [l.id, l]));
      expect(byId.get('usb-power')?.alreadyOptimal).toBe(false);
      expect(byId.get('pse-power')?.alreadyOptimal).toBe(false);
      expect(byId.get('iot-radio')?.alreadyOptimal).toBe(false);
      expect(byId.get('auto-tx-power-min')?.alreadyOptimal).toBe(false);
      expect(byId.get('force-poe-plus')?.alreadyOptimal).toBe(false);
      expect(byId.get('pse-power')?.tradeOff).toContain('powering');
    });

    it('does not offer to disable 2.4 GHz when it is the only radio up', () => {
      const lonely = {
        ...AP5020_DETAILS,
        radios: [
          { radioIndex: 1, mode: 'gnxbe', channelwidth: 'Ch1Width_20MHz', adminState: true },
          { radioIndex: 2, mode: 'ancxbe', channelwidth: 'Ch1Width_40MHz', adminState: false },
          { radioIndex: 3, mode: 'ax6be', channelwidth: 'Ch1Width_80MHz', adminState: false },
        ],
      } as unknown as APDetails;

      const ids = derivePowerLevers(lonely).map((l) => l.id);
      expect(ids).not.toContain('radio-1-admin');
      // A disabled radio's width is not actionable either.
      expect(ids).not.toContain('radio-2-width');
      expect(ids).not.toContain('radio-3-width');
    });

    it('survives an AP with no radios reported', () => {
      const bare = { ...AP5020_DETAILS, radios: undefined } as APDetails;
      const levers = derivePowerLevers(bare);
      expect(levers.length).toBeGreaterThan(0);
      expect(levers.every((l) => l.configTarget !== 'radio')).toBe(true);
    });
  });
});
