/**
 * EP1 brand color compliance + WCAG contrast utilities.
 *
 * Two jobs:
 *   1. Tell you whether a raw hex value corresponds to a palette token (so hardcoded
 *      colors can be migrated to `src/config/colorPalette.ts`).
 *   2. Compute real WCAG 2.1 contrast ratios.
 *
 * On (2): compute, never estimate. Contrast is cheap to calculate and impossible to
 * eyeball — an earlier revision of the EDS docs asserted ratios up to 14.85:1 for pairs
 * that actually measure 2.18:1. Every ratio quoted anywhere in this codebase should come
 * from `getContrastRatio`, and the palette's claims are enforced in `colorPalette.test.ts`.
 */

import {
  STATUS_COLORS,
  STATUS_COLORS_LIGHT,
  PROTOCOL_COLORS,
  PROTOCOL_COLORS_LIGHT,
  BAND_COLORS,
  BAND_COLORS_LIGHT,
  SNR_QUALITY_COLORS,
  CHART_COLORS,
  ROAMING_QUALITY_COLORS,
  DONUT_COLORS,
  EP1_BRAND,
  EP1_EXTENDED,
  EP1_EXTENDED_LIGHT,
} from '../config/colorPalette';

/** hex (lowercased) -> the token path that defines it. */
const EDS_TOKEN_REGISTRY: Record<string, string> = {};

function register(namespace: string, entries: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(entries)) {
    if (typeof value !== 'string' || !value.startsWith('#')) continue;
    const hex = value.toLowerCase();
    // First registration wins, so the most semantically meaningful namespace (registered
    // first below) is what gets suggested for a shared hex like the EP1 purple.
    if (!EDS_TOKEN_REGISTRY[hex]) EDS_TOKEN_REGISTRY[hex] = `${namespace}.${key}`;
  }
}

register('STATUS_COLORS', STATUS_COLORS);
register('STATUS_COLORS_LIGHT', STATUS_COLORS_LIGHT);
register('PROTOCOL_COLORS', PROTOCOL_COLORS);
register('PROTOCOL_COLORS_LIGHT', PROTOCOL_COLORS_LIGHT);
register('BAND_COLORS', BAND_COLORS);
register('BAND_COLORS_LIGHT', BAND_COLORS_LIGHT);
register('SNR_QUALITY_COLORS', SNR_QUALITY_COLORS);
register('CHART_COLORS', CHART_COLORS);
register('CHART_COLORS.series', CHART_COLORS.series);
register('EP1_BRAND', EP1_BRAND);
register('EP1_EXTENDED', EP1_EXTENDED);
register('EP1_EXTENDED_LIGHT', EP1_EXTENDED_LIGHT);

for (const [key, value] of Object.entries(ROAMING_QUALITY_COLORS)) {
  const hex = value.hex.toLowerCase();
  if (!EDS_TOKEN_REGISTRY[hex]) EDS_TOKEN_REGISTRY[hex] = `ROAMING_QUALITY_COLORS.${key}.hex`;
}
DONUT_COLORS.forEach((value, index) => {
  const hex = value.toLowerCase();
  if (!EDS_TOKEN_REGISTRY[hex]) EDS_TOKEN_REGISTRY[hex] = `DONUT_COLORS[${index}]`;
});

/**
 * Find the palette token for a color value.
 * @returns token path (e.g. `STATUS_COLORS.success`), or null if the color is not in the palette
 */
export function getColorCompliance(colorValue: string): string | null {
  return EDS_TOKEN_REGISTRY[colorValue.toLowerCase()] ?? null;
}

/** True when the color corresponds to a palette token. */
export function isEDSCompliant(colorValue: string): boolean {
  return getColorCompliance(colorValue) !== null;
}

/** Snapshot of the hex -> token map. */
export function getEDSColorTokens(): Record<string, string> {
  return { ...EDS_TOKEN_REGISTRY };
}

function hexToRgb(hex: string): [number, number, number] | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : null;
}

/** WCAG 2.1 relative luminance. */
function getLuminance(color: string): number {
  const rgb = hexToRgb(color);
  if (!rgb) return 0;

  const [r, g, b] = rgb.map((val) => {
    const channel = val / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio, 1–21. */
export function getContrastRatio(color1: string, color2: string): number {
  const lum1 = getLuminance(color1);
  const lum2 = getLuminance(color2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * WCAG conformance targets.
 * - `AA` / `AAA` are text thresholds.
 * - `graphic` is 1.4.11 non-text contrast — the correct bar for chart fills, strokes,
 *   icons and other marks that are not read as text.
 */
export type WCAGLevel = 'AA' | 'AAA' | 'graphic';

const WCAG_THRESHOLDS: Record<WCAGLevel, number> = {
  AA: 4.5,
  AAA: 7,
  graphic: 3,
};

export interface ContrastResult {
  pass: boolean;
  /** Rounded to 2dp. */
  ratio: number;
  required: number;
  level: WCAGLevel;
}

/** Check a foreground/background pair against a WCAG threshold. */
export function validateWCAGContrast(
  foregroundColor: string,
  backgroundColor: string,
  level: WCAGLevel = 'AA'
): ContrastResult {
  const ratio = getContrastRatio(foregroundColor, backgroundColor);
  const required = WCAG_THRESHOLDS[level];

  return {
    pass: ratio >= required,
    ratio: Math.round(ratio * 100) / 100,
    required,
    level,
  };
}

/**
 * Status foreground/background pairings per theme.
 *
 * These are the combinations the palette is built around, and each is asserted to clear
 * AA (4.5:1) in `colorPalette.test.ts` — not "AAA certified", which the previous version
 * of this file claimed without measuring. Measured values sit between 4.5:1 and 8.9:1
 * depending on the pair; call `validateWCAGContrast` if you need the exact number.
 *
 * `light` uses the darkened variants — the EP1 base hues fail on white.
 */
export const STATUS_PAIRS = {
  light: {
    success: { fg: STATUS_COLORS_LIGHT.success, bg: STATUS_COLORS.successBg },
    warning: { fg: STATUS_COLORS_LIGHT.warning, bg: STATUS_COLORS.warningBg },
    critical: { fg: STATUS_COLORS_LIGHT.critical, bg: STATUS_COLORS.criticalBg },
    info: { fg: STATUS_COLORS_LIGHT.info, bg: STATUS_COLORS.infoBg },
  },
  dark: {
    success: { fg: STATUS_COLORS.success, bg: STATUS_COLORS.successBgDark },
    warning: { fg: STATUS_COLORS.warning, bg: STATUS_COLORS.warningBgDark },
    critical: { fg: STATUS_COLORS.critical, bg: STATUS_COLORS.criticalBgDark },
    info: { fg: STATUS_COLORS.info, bg: STATUS_COLORS.infoBgDark },
  },
  ep1: {
    success: { fg: STATUS_COLORS.success, bg: STATUS_COLORS.successBgEp1 },
    warning: { fg: STATUS_COLORS.warning, bg: STATUS_COLORS.warningBgEp1 },
    critical: { fg: STATUS_COLORS.critical, bg: STATUS_COLORS.criticalBgEp1 },
    info: { fg: STATUS_COLORS.info, bg: STATUS_COLORS.infoBgEp1 },
  },
} as const;

/** sRGB hex -> CIELAB, D65 white point. */
function hexToLab(hex: string): [number, number, number] {
  const rgb = hexToRgb(hex);
  if (!rgb) return [0, 0, 0];

  const [r, g, b] = rgb.map((val) => {
    const channel = val / 255;
    return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });

  // sRGB -> XYZ, normalised to the D65 illuminant
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * Perceptual distance between two colors (CIE76 ΔE).
 *
 * Use this — not `getContrastRatio` — when asking "can a user tell these two apart?"
 * for categorical marks like pie slices or series lines. Contrast ratio measures only
 * luminance, so it reports two colors of identical lightness as indistinguishable even
 * when they are opposite hues.
 *
 * Rough scale: <2.3 imperceptible, ~10 noticeable, >20 clearly distinct categories.
 */
export function getDeltaE(color1: string, color2: string): number {
  const [l1, a1, b1] = hexToLab(color1);
  const [l2, a2, b2] = hexToLab(color2);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

/**
 * Smallest perceptual gap in a categorical palette.
 * Returns the closest pair and its ΔE so a failure names the offending colors.
 */
export function findClosestPair(colors: readonly string[]): {
  a: string;
  b: string;
  deltaE: number;
} {
  let closest = { a: colors[0] ?? '', b: colors[1] ?? '', deltaE: Infinity };

  for (let i = 0; i < colors.length; i += 1) {
    for (let j = i + 1; j < colors.length; j += 1) {
      const deltaE = getDeltaE(colors[i], colors[j]);
      if (deltaE < closest.deltaE) closest = { a: colors[i], b: colors[j], deltaE };
    }
  }

  return closest;
}

export interface ColorAuditEntry {
  file: string;
  line: number;
  color: string;
  token: string | null;
  context: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

/**
 * Suggest a palette token for a non-compliant color.
 *
 * Exact matches only. Nearest-color matching is deliberately not implemented: silently
 * mapping an arbitrary hex onto a brand token is how off-brand colors get laundered into
 * looking official. An unmatched color should be reviewed by a human.
 */
export function suggestNearestToken(colorValue: string): string | null {
  return getColorCompliance(colorValue);
}
