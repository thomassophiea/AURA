/**
 * Client mirror of the server's ambient-light-sensor source of truth
 * (`server/energy/apCapabilities.js`). Sensor eligibility derives from the AP
 * MODEL: Extreme families whose hardware exposes an onboard ambient-light sensor
 * visible through the radome. Substrings match variants, so 'AP4020' covers
 * AP4020 / AP4020X / AP4020FX and 'AP4060' covers AP4060 / AP4060X.
 */
export const SENSOR_MODELS = ['AP4020', 'AP4060', 'AP5020'] as const;

export function supportsLightSensor(model: string | undefined | null): boolean {
  const m = typeof model === 'string' ? model.toUpperCase() : '';
  return SENSOR_MODELS.some((s) => m.includes(s));
}

interface SavingsInput {
  darkHours: number;
  dimHours: number;
  /** Fraction of an AP's power avoided while dark (6 GHz off + Tx cut). */
  darkFactor: number;
  /** Fraction avoided while dim (Tx cut). */
  dimFactor: number;
  ratePerKwh: number;
}

/**
 * Models annual energy avoided if the given sensor-capable APs spent
 * `darkHours`/`dimHours` per day in those states. Modeled, not measured — the
 * hours are the seam the real ambient-light telemetry replaces.
 */
export function projectLightAwareSavings(
  aps: { watts: number }[],
  { darkHours, dimHours, darkFactor, dimFactor, ratePerKwh }: SavingsInput
): { kwh: number; cost: number } {
  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(Number.isFinite(value) ? value : min, max));
  const safeDarkHours = clamp(darkHours, 0, 24);
  const safeDimHours = clamp(dimHours, 0, 24 - safeDarkHours);
  const safeDarkFactor = clamp(darkFactor, 0, 1);
  const safeDimFactor = clamp(dimFactor, 0, 1);
  const safeRate = Math.max(0, Number.isFinite(ratePerKwh) ? ratePerKwh : 0);
  const whPerWattDay =
    safeDarkHours * safeDarkFactor + safeDimHours * safeDimFactor;
  let whPerDay = 0;
  for (const ap of aps) {
    if (Number.isFinite(ap.watts) && ap.watts > 0) whPerDay += ap.watts * whPerWattDay;
  }
  const kwh = (whPerDay * 365) / 1000;
  return { kwh, cost: kwh * safeRate };
}
