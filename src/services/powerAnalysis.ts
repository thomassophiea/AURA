/**
 * AP Power Analysis
 *
 * Pure functions backing the Green AP initiative's power context panel. No I/O —
 * everything is derived from an `APInsightsResponse` already fetched by the
 * caller, plus (for levers) an `APDetails` config read.
 *
 * Two hard rules, both load-bearing:
 *
 * 1. WATTS COME FROM THE `unit` FIELD, NOT FROM ASSUMPTION. The controller
 *    reports `apPowerConsumptionTimeseries` in mW (verified against XCC
 *    10.18.1.0-011R). Reading it as W overstates draw by 1000x, which is how
 *    an AP5020 drawing 18.7 W came to be rendered as "18670 W".
 *
 * 2. NO FABRICATED ATTRIBUTION. The controller exposes no per-radio tx power
 *    history, no CPU/memory series, and no PoE draw telemetry — probing those
 *    widget names returns empty. So a "radios drew 4.2 W" breakdown cannot be
 *    computed, only invented. Evidence it would be wrong: three AP5020s with
 *    effectively identical radio config share a ~13.1 W floor but swing 0.74 W,
 *    3.80 W, and 5.14 W respectively. Config predicts the floor; nothing
 *    available predicts the delta. This module therefore reports what power DID
 *    do, which correlates against it, and says "unexplained" when that is the
 *    truthful answer.
 */

import type {
  APDetails,
  APInsightsReport,
  APInsightsResponse,
  APInsightsStatistic,
} from '../types/api';
import type {
  PowerContext,
  PowerLever,
  PowerPersistence,
  PowerVerdict,
  PowerWindowStats,
  SeriesMovement,
} from '../types/power';

/** A series moves "unusually" past this robust z-score. */
const MOVEMENT_Z_THRESHOLD = 2;

/** A series must track power at least this strongly to count as an explanation. */
const CORRELATION_THRESHOLD = 0.5;

/** Power within this percentage of baseline is normal variation, not a spike. */
const NOMINAL_DELTA_PERCENT = 5;

/** Consecutive elevated samples at or above this count read as sustained. */
const SUSTAINED_SAMPLE_COUNT = 3;

/** Scale factor converting median absolute deviation to a normal-consistent sigma. */
const MAD_TO_SIGMA = 1.4826;

/**
 * A series needs at least this many distinct values before its z-score means
 * anything. Coarsely quantised series otherwise produce spurious outliers: the
 * controller's noise floor reports only -100 and -99 dBm across a whole window,
 * so a 1 dBm step scores z=2.45 and outranks a genuine throughput spike. Such a
 * series still reports its value and delta — it just is not ranked as unusual.
 */
const DISTINCT_VALUE_MINIMUM = 4;

/** Which reports and statistics are candidate correlates for power. */
const CORRELATE_SERIES: ReadonlyArray<{
  report: keyof APInsightsResponse;
  stat: string;
  label: string;
}> = [
  { report: 'throughputReport', stat: 'Total', label: 'Total throughput' },
  { report: 'throughputReport', stat: 'Download', label: 'Download' },
  { report: 'throughputReport', stat: 'Upload', label: 'Upload' },
  { report: 'countOfUniqueUsersReport', stat: 'tntUniqueUsers', label: 'Unique clients' },
  { report: 'baseliningAPRss', stat: 'Rss', label: 'Client RSS' },
  { report: 'channelUtilization5', stat: 'CoChannel', label: 'Co-channel 5 GHz' },
  { report: 'channelUtilization5', stat: 'Interference', label: 'Interference 5 GHz' },
  { report: 'channelUtilization5', stat: 'ClientData', label: 'Client data 5 GHz' },
  { report: 'channelUtilization2_4', stat: 'CoChannel', label: 'Co-channel 2.4 GHz' },
  { report: 'channelUtilization2_4', stat: 'Interference', label: 'Interference 2.4 GHz' },
  { report: 'channelUtilization2_4', stat: 'ClientData', label: 'Client data 2.4 GHz' },
  { report: 'noisePerRadio', stat: 'R1', label: 'Noise radio 1' },
  { report: 'noisePerRadio', stat: 'R2', label: 'Noise radio 2' },
  { report: 'noisePerRadio', stat: 'R3', label: 'Noise radio 3' },
];

const POWER_STAT_NAME = 'Power Consumption';

/** A timestamp-keyed numeric series. Absent keys mean "no reading", never zero. */
type Samples = Map<number, number>;

/**
 * Convert a raw statistic value to watts using the unit the controller declared.
 * Unknown units are passed through untouched rather than guessed at.
 */
function toWatts(value: number, unit: string): number {
  const normalized = unit.trim().toLowerCase();
  if (normalized === 'mw') return value / 1000;
  if (normalized === 'kw') return value * 1000;
  return value;
}

/**
 * Extract a statistic as timestamped samples, skipping non-numeric readings.
 *
 * The controller sends the string `"null"` for statistics it tracks but has no
 * data for (`Interference`, `ClientData`, and `Available` are all-null on
 * 10.18.1.0-011R). Those must not become zeroes: a flat zero line reads as a
 * measured value of nothing, when the truth is no measurement at all.
 */
function extractSamples(stat: APInsightsStatistic | undefined): Samples {
  const samples: Samples = new Map();
  if (!stat?.values) return samples;

  for (const point of stat.values) {
    const parsed = Number.parseFloat(point.value);
    if (!Number.isFinite(parsed)) continue;
    const ts = Number(point.timestamp);
    if (!Number.isFinite(ts)) continue;
    samples.set(ts, parsed);
  }
  return samples;
}

function findStat(
  report: APInsightsReport | undefined,
  statName: string
): APInsightsStatistic | undefined {
  // Controller pads some statNames with trailing spaces (e.g. `"Rss Base "`).
  return report?.statistics?.find((s) => s.statName?.trim() === statName);
}

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Robust spread via median absolute deviation, falling back to standard
 * deviation when the MAD is zero (which happens when over half the samples are
 * identical — common for integer series like client count).
 * Returns 0 for a genuinely flat series.
 */
function robustSigma(values: number[]): number {
  if (values.length < 2) return 0;
  const med = median(values);
  const mad = median(values.map((v) => Math.abs(v - med)));
  if (mad > 0) return mad * MAD_TO_SIGMA;

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Pearson correlation over timestamps present in both series. Null if either is flat. */
function correlate(a: Samples, b: Samples): number | null {
  const shared: Array<[number, number]> = [];
  for (const [ts, av] of a) {
    const bv = b.get(ts);
    if (bv !== undefined) shared.push([av, bv]);
  }
  if (shared.length < 3) return null;

  const n = shared.length;
  const meanA = shared.reduce((sum, [av]) => sum + av, 0) / n;
  const meanB = shared.reduce((sum, [, bv]) => sum + bv, 0) / n;

  let numerator = 0;
  let sumSqA = 0;
  let sumSqB = 0;
  for (const [av, bv] of shared) {
    const da = av - meanA;
    const db = bv - meanB;
    numerator += da * db;
    sumSqA += da * da;
    sumSqB += db * db;
  }

  const denominator = Math.sqrt(sumSqA * sumSqB);
  if (denominator === 0) return null;
  return numerator / denominator;
}

/** Timestamp in `samples` closest to `target`. Null when there are no samples. */
function nearestTimestamp(samples: Samples, target: number): number | null {
  let best: number | null = null;
  let bestDiff = Infinity;
  for (const ts of samples.keys()) {
    const diff = Math.abs(ts - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = ts;
    }
  }
  return best;
}

/**
 * Count consecutive samples around `index` that stay above `threshold`,
 * including the sample at `index` itself.
 */
function countConsecutive(ordered: number[], index: number, threshold: number): number {
  if (ordered[index] <= threshold) return 0;

  let count = 1;
  for (let i = index - 1; i >= 0 && ordered[i] > threshold; i -= 1) count += 1;
  for (let i = index + 1; i < ordered.length && ordered[i] > threshold; i += 1) count += 1;
  return count;
}

function buildVerdict(
  deltaPercent: number,
  percentile: number,
  movements: SeriesMovement[],
  sampleCount: number
): { verdict: PowerVerdict; detail: string } {
  if (sampleCount < 3) {
    return {
      verdict: 'insufficient-data',
      detail: `Only ${sampleCount} power ${sampleCount === 1 ? 'sample' : 'samples'} in this window — not enough to establish a baseline.`,
    };
  }

  if (Math.abs(deltaPercent) < NOMINAL_DELTA_PERCENT && percentile < 90) {
    return {
      verdict: 'nominal',
      detail: `Within ${NOMINAL_DELTA_PERCENT}% of this AP's baseline for the window. Normal variation.`,
    };
  }

  const movers = movements.filter(
    (m) => m.zScore !== null && Math.abs(m.zScore) >= MOVEMENT_Z_THRESHOLD
  );
  const explainers = movers.filter(
    (m) => m.correlation !== null && Math.abs(m.correlation) >= CORRELATION_THRESHOLD
  );

  if (explainers.length > 0) {
    const names = explainers.map((m) => m.label).join(', ');
    return {
      verdict: 'explained',
      detail: `${names} moved unusually here and ${explainers.length === 1 ? 'tracks' : 'track'} power across the window.`,
    };
  }

  const unattributable =
    'The controller exposes no per-radio tx power, CPU, or PoE draw as a timeseries, so this cannot be attributed further from available data.';

  if (movers.length > 0) {
    const names = movers.map((m) => m.label).join(', ');
    return {
      verdict: 'unexplained',
      detail: `${names} also moved here, but ${movers.length === 1 ? 'does' : 'do'} not track power across the window — so the movement is likely coincidental. ${unattributable}`,
    };
  }

  return {
    verdict: 'unexplained',
    detail: `No available series moved unusually at this point. ${unattributable}`,
  };
}

/**
 * Build the full power context at a locked timestamp.
 *
 * Returns null when there is no usable power series — the caller renders
 * nothing rather than an empty shell.
 */
export function buildPowerContext(
  insights: APInsightsResponse | null,
  lockedTimestamp: number | null
): PowerContext | null {
  if (!insights || lockedTimestamp === null) return null;

  const powerReport = insights.apPowerConsumptionTimeseries?.[0];
  const powerStat = findStat(powerReport, POWER_STAT_NAME);
  if (!powerStat) return null;

  const rawPower = extractSamples(powerStat);
  if (rawPower.size === 0) return null;

  // Normalise to watts once, here, driven by the declared unit.
  const unit = powerStat.unit ?? '';
  const power: Samples = new Map();
  for (const [ts, value] of rawPower) power.set(ts, toWatts(value, unit));

  const timestamp = nearestTimestamp(power, lockedTimestamp);
  if (timestamp === null) return null;
  const powerW = power.get(timestamp) as number;

  const orderedTimestamps = [...power.keys()].sort((a, b) => a - b);
  const orderedValues = orderedTimestamps.map((ts) => power.get(ts) as number);

  const window: PowerWindowStats = {
    floorW: Math.min(...orderedValues),
    baselineW: median(orderedValues),
    peakW: Math.max(...orderedValues),
    sampleCount: orderedValues.length,
  };

  const deltaW = powerW - window.baselineW;
  const deltaPercent = window.baselineW === 0 ? 0 : (deltaW / window.baselineW) * 100;
  const atOrBelow = orderedValues.filter((v) => v <= powerW).length;
  const percentile = (atOrBelow / orderedValues.length) * 100;

  // Elevated means halfway or more from baseline toward this sample. For readings
  // at or below baseline there is no elevation to measure, so persistence is 1.
  const index = orderedTimestamps.indexOf(timestamp);
  let persistenceSamples = 1;
  if (deltaW > 0) {
    persistenceSamples = countConsecutive(
      orderedValues,
      index,
      window.baselineW + deltaW / 2
    );
  }
  const persistence: PowerPersistence =
    persistenceSamples >= SUSTAINED_SAMPLE_COUNT ? 'sustained' : 'transient';

  const movements: SeriesMovement[] = [];
  for (const candidate of CORRELATE_SERIES) {
    const report = (insights[candidate.report] as APInsightsReport[] | undefined)?.[0];
    const stat = findStat(report, candidate.stat);
    if (!stat) continue;

    const samples = extractSamples(stat);
    // All-null on this controller build: omit rather than plot a flat zero,
    // which would read as a measured value of nothing.
    if (samples.size === 0) continue;

    const valueTs = nearestTimestamp(samples, timestamp);
    if (valueTs === null) continue;
    const value = samples.get(valueTs) as number;

    const values = [...samples.values()];
    const windowMedian = median(values);
    const sigma = robustSigma(values);
    const delta = value - windowMedian;
    const rankable = new Set(values).size >= DISTINCT_VALUE_MINIMUM && sigma > 0;

    movements.push({
      key: `${candidate.report}.${candidate.stat}`,
      label: candidate.label,
      value,
      unit: stat.unit ?? '',
      windowMedian,
      delta,
      zScore: rankable ? delta / sigma : null,
      correlation: correlate(power, samples),
    });
  }

  movements.sort((a, b) => Math.abs(b.zScore ?? 0) - Math.abs(a.zScore ?? 0));

  const { verdict, detail } = buildVerdict(
    deltaPercent,
    percentile,
    movements,
    window.sampleCount
  );

  return {
    timestamp,
    powerW,
    window,
    deltaW,
    deltaPercent,
    aboveFloorW: powerW - window.floorW,
    percentile,
    persistence,
    persistenceSamples,
    movements,
    verdict,
    verdictDetail: detail,
  };
}

/** Map a controller radio mode string to its band label. */
function bandForMode(mode: string | undefined, radioIndex: number): string {
  const m = (mode ?? '').toLowerCase();
  if (m.startsWith('ax6') || m.startsWith('6')) return '6 GHz';
  if (m.startsWith('g')) return '2.4 GHz';
  if (m.startsWith('a') || m.startsWith('n')) return '5 GHz';
  // Fall back to the conventional index ordering when mode is unrecognised.
  if (radioIndex === 1) return '2.4 GHz';
  if (radioIndex === 2) return '5 GHz';
  return '6 GHz';
}

/** `"Ch1Width_80MHz"` -> 80. Null when unparseable. */
function parseChannelWidth(raw: string | undefined): number | null {
  const match = /(\d+)\s*MHz/i.exec(raw ?? '');
  return match ? Number.parseInt(match[1], 10) : null;
}

/**
 * Derive the configuration levers that affect this AP's standing power draw.
 *
 * Every lever is advisory. None carries a watt estimate, because none can be
 * measured from available telemetry — the honest verification path is to apply
 * a change and re-read the AP's own window floor afterward.
 *
 * Already-optimal levers are returned too, flagged, so the panel can show what
 * was checked rather than silently omitting it.
 */
export function derivePowerLevers(ap: APDetails | null): PowerLever[] {
  if (!ap) return [];

  const levers: PowerLever[] = [];
  const radios = Array.isArray(ap.radios) ? ap.radios : [];
  const enabledRadios = radios.filter((r) => r?.adminState);

  for (const radio of radios) {
    if (!radio || radio.radioIndex === undefined || radio.radioIndex === null) continue;
    const band = bandForMode(radio.mode, radio.radioIndex);
    const width = parseChannelWidth(radio.channelwidth);

    if (radio.adminState && width !== null && width > 20) {
      levers.push({
        id: `radio-${radio.radioIndex}-width`,
        label: `${band} channel width`,
        currentValue: `${width} MHz`,
        proposedValue: `${width / 2} MHz`,
        tradeOff: 'Halves peak per-client throughput on this band.',
        alreadyOptimal: false,
        configTarget: 'radio',
      });
    }

    // Only offered for 2.4 GHz, and only when another band still covers the area.
    if (radio.adminState && band === '2.4 GHz' && enabledRadios.length > 1) {
      levers.push({
        id: `radio-${radio.radioIndex}-admin`,
        label: '2.4 GHz radio',
        currentValue: 'Enabled',
        proposedValue: 'Disabled',
        tradeOff: 'Drops all legacy and IoT clients that cannot use 5 or 6 GHz.',
        alreadyOptimal: false,
        configTarget: 'radio',
      });
    }
  }

  const usbOff = (ap.usbPower ?? 'Off') === 'Off';
  levers.push({
    id: 'usb-power',
    label: 'USB port power',
    currentValue: String(ap.usbPower ?? 'Off'),
    proposedValue: 'Off',
    tradeOff: usbOff ? '' : 'Cuts power to any USB-attached accessory.',
    alreadyOptimal: usbOff,
    configTarget: 'ap-ports',
  });

  const pseOff = (ap.psePower ?? 'Off') === 'Off';
  levers.push({
    id: 'pse-power',
    label: 'PSE (downstream PoE out)',
    currentValue: String(ap.psePower ?? 'Off'),
    proposedValue: 'Off',
    tradeOff: pseOff ? '' : 'Cuts power to the device this AP is powering.',
    alreadyOptimal: pseOff,
    configTarget: 'ap-ports',
  });

  const iotOff = !ap.iotEnabled;
  levers.push({
    id: 'iot-radio',
    label: 'IoT / BLE radio',
    currentValue: ap.iotEnabled ? 'Enabled' : 'Disabled',
    proposedValue: 'Disabled',
    tradeOff: iotOff ? '' : 'Disables BLE beaconing and location services.',
    alreadyOptimal: iotOff,
    configTarget: 'ap-general',
  });

  const ledOff = String(ap.ledStatus ?? '').toUpperCase() === 'OFF';
  levers.push({
    id: 'led-status',
    label: 'Status LEDs',
    currentValue: String(ap.ledStatus ?? 'NORMAL'),
    proposedValue: 'OFF',
    tradeOff: ledOff ? '' : 'Removes at-a-glance physical status indication.',
    alreadyOptimal: ledOff,
    configTarget: 'ap-general',
  });

  const autoTxMin = Boolean(ap.autoTxPowerMin);
  levers.push({
    id: 'auto-tx-power-min',
    label: 'Auto tx power minimum',
    currentValue: autoTxMin ? 'Enabled' : 'Disabled',
    proposedValue: 'Enabled',
    tradeOff: autoTxMin ? '' : 'Lets RRM settle radios at lower tx power.',
    alreadyOptimal: autoTxMin,
    configTarget: 'ap-general',
  });

  const poePlusOff = !ap.forcePoEPlus;
  levers.push({
    id: 'force-poe-plus',
    label: 'Force PoE+',
    currentValue: ap.forcePoEPlus ? 'Enabled' : 'Disabled',
    proposedValue: 'Disabled',
    tradeOff: poePlusOff ? '' : 'Removes the forced higher-power PoE class request.',
    alreadyOptimal: poePlusOff,
    configTarget: 'ap-ports',
  });

  return levers;
}
