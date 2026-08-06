/**
 * AP Power Analysis Types
 *
 * Supports the Green AP initiative: explaining power consumption at a locked
 * point on the AP Insights timeline, and surfacing the configuration levers
 * that affect an AP's standing power draw.
 *
 * Honesty contract for these types:
 * - Every wattage is DERIVED FROM MEASURED TELEMETRY (the controller's
 *   `apPowerConsumptionTimeseries`, reported in mW). There is no per-component
 *   watt decomposition, because the controller exposes no per-radio, PoE, or
 *   CPU power telemetry to attribute against.
 * - Lever savings are UNVERIFIED. `PowerLever` carries no watt estimate; it
 *   names the config change and its trade-off. The user verifies the effect by
 *   re-reading the AP's own floor after applying it.
 */

/** Verdict on whether the available telemetry explains a power reading. */
export type PowerVerdict =
  /** At least one series moved enough, and tracks power across the window. */
  | 'explained'
  /** Power moved but nothing available accounts for it. */
  | 'unexplained'
  /** Not enough samples to say anything (single sample, or no power series). */
  | 'insufficient-data'
  /** Power at this timestamp is within normal variation — nothing to explain. */
  | 'nominal';

/** How long the elevated reading persisted. */
export type PowerPersistence = 'transient' | 'sustained';

/** One correlated series' behaviour at the locked timestamp. */
export interface SeriesMovement {
  /** Series key, e.g. `throughput.Total`. Stable across renders. */
  key: string;
  /** Human label, e.g. "Total throughput". */
  label: string;
  /** Value at the locked timestamp. */
  value: number;
  /** Unit as reported by the controller, e.g. `bps`, `%`, `dBm`, `users`. */
  unit: string;
  /** Median of this series across the loaded window. */
  windowMedian: number;
  /** `value - windowMedian`. */
  delta: number;
  /**
   * Robust z-score: delta / (MAD-derived sigma). Used for ranking, and to test
   * whether this series moved unusually.
   *
   * Null when the series cannot support the claim — it is flat, or too coarsely
   * quantised for a z-score to mean anything (the noise floor reports only two
   * distinct dBm values across a window, where a 1 dBm step scores z=2.45).
   * A null z-score does not hide the series; `value` and `delta` still stand.
   */
  zScore: number | null;
  /**
   * Pearson correlation of this series against power across the whole window.
   * Null when either series is flat. A series can spike at T yet be uncorrelated
   * overall — both facts matter, so both are kept.
   */
  correlation: number | null;
}

/** Power statistics for the loaded window, all measured. */
export interface PowerWindowStats {
  /** Lowest observed draw in the window, in watts. The AP's empirical floor. */
  floorW: number;
  /** Median observed draw in the window, in watts. The baseline. */
  baselineW: number;
  /** Highest observed draw in the window, in watts. */
  peakW: number;
  /** Number of power samples in the window. */
  sampleCount: number;
}

/** A configuration change that affects standing power draw. */
export interface PowerLever {
  id: string;
  label: string;
  /** Current value as read from the AP config, rendered for display. */
  currentValue: string;
  /** What to change it to. */
  proposedValue: string;
  /** What this costs you. Empty string when the change has no service impact. */
  tradeOff: string;
  /**
   * Whether this lever is already in its lowest-power state. Already-optimal
   * levers are still surfaced, so the user can see what was checked.
   */
  alreadyOptimal: boolean;
  /** Where the user goes to change it. */
  configTarget: 'radio' | 'ap-ports' | 'ap-general';
}

/** Complete power context at a locked timestamp. */
export interface PowerContext {
  /** The locked timestamp, in epoch ms. Matches the nearest power sample. */
  timestamp: number;
  /** Measured draw at `timestamp`, in watts. */
  powerW: number;
  /** Window statistics, all measured. */
  window: PowerWindowStats;
  /** `powerW - window.baselineW`. Positive means above baseline. */
  deltaW: number;
  /** Delta as a percentage of baseline. */
  deltaPercent: number;
  /** `powerW - window.floorW`: the variable component above this AP's floor. */
  aboveFloorW: number;
  /** 0-100: where this sample ranks among all power samples in the window. */
  percentile: number;
  /** Consecutive elevated samples around `timestamp`. */
  persistence: PowerPersistence;
  /** Count of consecutive elevated samples including this one. */
  persistenceSamples: number;
  /** Every series with real data, ranked by absolute z-score, descending. */
  movements: SeriesMovement[];
  verdict: PowerVerdict;
  /** Plain-language statement of the verdict, shown to the user verbatim. */
  verdictDetail: string;
}
