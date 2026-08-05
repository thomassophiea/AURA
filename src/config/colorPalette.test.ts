import { describe, it, expect } from 'vitest';
import {
  EP1_BRAND,
  EP1_EXTENDED,
  EP1_EXTENDED_LIGHT,
  STATUS_COLORS,
  STATUS_COLORS_LIGHT,
  PROTOCOL_COLORS,
  PROTOCOL_COLORS_LIGHT,
  BAND_COLORS,
  BAND_COLORS_LIGHT,
  SNR_QUALITY_COLORS,
  CHART_COLORS,
  DONUT_COLORS,
  ROAMING_QUALITY_COLORS,
  isValidColor,
  isDarkSurface,
  resolveStatusColor,
  resolveBandColor,
  resolveProtocolColor,
  getColorByTheme,
} from './colorPalette';
import { getContrastRatio, getDeltaE, findClosestPair } from '../lib/colorValidator';

/**
 * These tests enforce the contrast claims made in colorPalette.ts.
 *
 * WCAG 2.1 thresholds used here:
 *   4.5:1 — AA, normal text
 *   3.0:1 — 1.4.11 non-text contrast, which is what chart fills/strokes must clear
 *
 * A previous revision of this palette shipped documentation claiming 14.85:1 for a
 * pair that actually measures 2.18:1. That is the failure mode these tests exist to
 * prevent: never assert a ratio that has not been computed.
 */

const WHITE = '#ffffff';
const EP1_SURFACE = EP1_BRAND.bgBase; // #1e1f2a

const AA_TEXT = 4.5;
const NON_TEXT = 3.0;

describe('palette integrity', () => {
  const everyHex: Array<[string, string]> = [
    ...Object.entries(EP1_BRAND),
    ...Object.entries(EP1_EXTENDED),
    ...Object.entries(EP1_EXTENDED_LIGHT),
    ...Object.entries(STATUS_COLORS_LIGHT),
    ...Object.entries(PROTOCOL_COLORS),
    ...Object.entries(PROTOCOL_COLORS_LIGHT),
    ...Object.entries(BAND_COLORS),
    ...Object.entries(BAND_COLORS_LIGHT),
    ...Object.entries(SNR_QUALITY_COLORS),
  ];

  it.each(everyHex)('%s (%s) is a valid hex color', (_name, hex) => {
    expect(isValidColor(hex)).toBe(true);
  });

  it('exposes a light companion for every light-sensitive token group', () => {
    expect(Object.keys(PROTOCOL_COLORS_LIGHT).sort()).toEqual(Object.keys(PROTOCOL_COLORS).sort());
    expect(Object.keys(BAND_COLORS_LIGHT).sort()).toEqual(Object.keys(BAND_COLORS).sort());
    expect(Object.keys(EP1_EXTENDED_LIGHT).sort()).toEqual(Object.keys(EP1_EXTENDED).sort());
  });

  it('donut palette has no duplicate adjacent colors', () => {
    for (let i = 1; i < DONUT_COLORS.length; i += 1) {
      expect(DONUT_COLORS[i]).not.toBe(DONUT_COLORS[i - 1]);
    }
  });

  it('roaming rgba values match their hex counterparts', () => {
    const toRgbTriplet = (hex: string) => {
      const m = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)!;
      return [1, 2, 3].map((i) => parseInt(m[i], 16)).join(',');
    };
    for (const { hex, rgba } of Object.values(ROAMING_QUALITY_COLORS)) {
      expect(rgba).toContain(toRgbTriplet(hex));
    }
  });
});

describe('EP1 base colors on dark surfaces', () => {
  // EP1 is a dark design language — these are the surfaces it was drawn for.
  const cases: Array<[string, string, number]> = [
    ['success', STATUS_COLORS.success, 7.0],
    ['warning', STATUS_COLORS.warning, 7.0],
    ['critical', STATUS_COLORS.critical, AA_TEXT],
    ['info', STATUS_COLORS.info, AA_TEXT],
  ];

  it.each(cases)('%s clears its threshold on the EP1 base surface', (_n, hex, min) => {
    expect(getContrastRatio(hex, EP1_SURFACE)).toBeGreaterThanOrEqual(min);
  });

  const badgePairs: Array<[string, string, string]> = [
    ['success', STATUS_COLORS.success, STATUS_COLORS.successBgEp1],
    ['warning', STATUS_COLORS.warning, STATUS_COLORS.warningBgEp1],
    ['critical', STATUS_COLORS.critical, STATUS_COLORS.criticalBgEp1],
    ['info', STATUS_COLORS.info, STATUS_COLORS.infoBgEp1],
  ];

  it.each(badgePairs)('%s badge clears AA on its EP1 background', (_n, fg, bg) => {
    expect(getContrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  const darkBadgePairs: Array<[string, string, string]> = [
    ['success', STATUS_COLORS.success, STATUS_COLORS.successBgDark],
    ['warning', STATUS_COLORS.warning, STATUS_COLORS.warningBgDark],
    ['critical', STATUS_COLORS.critical, STATUS_COLORS.criticalBgDark],
    ['info', STATUS_COLORS.info, STATUS_COLORS.infoBgDark],
  ];

  it.each(darkBadgePairs)('%s badge clears AA on its dark-theme background', (_n, fg, bg) => {
    expect(getContrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('light-theme variants', () => {
  const cases: Array<[string, string, string]> = [
    ['success', STATUS_COLORS_LIGHT.success, STATUS_COLORS.successBg],
    ['warning', STATUS_COLORS_LIGHT.warning, STATUS_COLORS.warningBg],
    ['critical', STATUS_COLORS_LIGHT.critical, STATUS_COLORS.criticalBg],
    ['info', STATUS_COLORS_LIGHT.info, STATUS_COLORS.infoBg],
  ];

  it.each(cases)('%s clears AA on white', (_n, fg) => {
    expect(getContrastRatio(fg, WHITE)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(cases)('%s clears AA on its own tint background', (_n, fg, bg) => {
    expect(getContrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(Object.entries(EP1_EXTENDED_LIGHT))('extended %s clears AA on white', (_n, hex) => {
    expect(getContrastRatio(hex, WHITE)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(Object.entries(PROTOCOL_COLORS_LIGHT))('protocol %s clears AA on white', (_n, hex) => {
    expect(getContrastRatio(hex, WHITE)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(Object.entries(BAND_COLORS_LIGHT))('band %s clears AA on white', (_n, hex) => {
    expect(getContrastRatio(hex, WHITE)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('chart marks as graphical objects (WCAG 1.4.11)', () => {
  const chartHues = [
    ...Object.values(EP1_EXTENDED),
    EP1_BRAND.purple,
    EP1_BRAND.purpleLight,
    EP1_BRAND.green,
    EP1_BRAND.amber,
    EP1_BRAND.red,
  ];

  it.each(chartHues)('%s clears 3:1 on the EP1 base surface', (hex) => {
    expect(getContrastRatio(hex, EP1_SURFACE)).toBeGreaterThanOrEqual(NON_TEXT);
  });

  it.each(DONUT_COLORS)('donut slice %s clears 3:1 on the EP1 base surface', (hex) => {
    expect(getContrastRatio(hex, EP1_SURFACE)).toBeGreaterThanOrEqual(NON_TEXT);
  });

  it('every donut slice is perceptually distinct from every other', () => {
    // Separability for categorical marks is a CIELAB distance question, not a contrast
    // one: teal and lilac differ by only 1.04:1 in contrast yet ΔE 62 apart, and are
    // obviously different slices. Threshold 12 is well above the ~2.3 JND; the binding
    // pair is the brand purple against its own lighter tint at ΔE 14.8.
    const { a, b, deltaE } = findClosestPair(DONUT_COLORS);
    expect(deltaE, `closest donut pair: ${a} vs ${b}`).toBeGreaterThan(12);
  });

  it('the donut palette wraps without a collision', () => {
    // Slice N sits against slice 1 in the ring.
    const first = DONUT_COLORS[0];
    const last = DONUT_COLORS[DONUT_COLORS.length - 1];
    expect(getDeltaE(first, last)).toBeGreaterThan(12);
  });
});

describe('theme resolution', () => {
  it('classifies dark surfaces', () => {
    expect(isDarkSurface('dark')).toBe(true);
    expect(isDarkSurface('ep1')).toBe(true);
    expect(isDarkSurface('dev')).toBe(true);
    expect(isDarkSurface('light')).toBe(false);
    expect(isDarkSurface('default')).toBe(false);
  });

  it('resolveStatusColor returns the EP1 base on dark and the variant on light', () => {
    expect(resolveStatusColor('success', 'ep1')).toBe(STATUS_COLORS.success);
    expect(resolveStatusColor('success', 'dark')).toBe(STATUS_COLORS.success);
    expect(resolveStatusColor('success', 'light')).toBe(STATUS_COLORS_LIGHT.success);
    expect(resolveStatusColor('success', 'default')).toBe(STATUS_COLORS_LIGHT.success);
  });

  it('resolveStatusColor defaults to the light-safe variant', () => {
    // Defaulting to the dark value would silently ship a 2.24:1 mark on white.
    expect(resolveStatusColor('success')).toBe(STATUS_COLORS_LIGHT.success);
  });

  it('resolveBandColor and resolveProtocolColor switch on theme', () => {
    expect(resolveBandColor('6', 'ep1')).toBe(BAND_COLORS['6']);
    expect(resolveBandColor('6', 'light')).toBe(BAND_COLORS_LIGHT['6']);
    expect(resolveProtocolColor('be', 'ep1')).toBe(PROTOCOL_COLORS.be);
    expect(resolveProtocolColor('be', 'light')).toBe(PROTOCOL_COLORS_LIGHT.be);
  });

  it('getColorByTheme selects the matching background variant', () => {
    expect(getColorByTheme('success', 'light')).toBe(STATUS_COLORS.successBg);
    expect(getColorByTheme('success', 'dark')).toBe(STATUS_COLORS.successBgDark);
    expect(getColorByTheme('success', 'ep1')).toBe(STATUS_COLORS.successBgEp1);
  });
});

describe('brand provenance', () => {
  // These four are lifted verbatim from the EP1 template block in src/lib/themes.ts.
  // If one changes, it is no longer a captured brand value and the comment in
  // colorPalette.ts marking it [captured] becomes a lie.
  it('captured EP1 primitives match the template', () => {
    expect(EP1_BRAND.purple).toBe('#8981e5');
    expect(EP1_BRAND.green).toBe('#75bf63');
    expect(EP1_BRAND.amber).toBe('#E5B85C');
    expect(EP1_BRAND.red).toBe('#ed5f56');
  });

  it('semantic tokens are wired to the captured primitives', () => {
    expect(STATUS_COLORS.success).toBe(EP1_BRAND.green);
    expect(STATUS_COLORS.warning).toBe(EP1_BRAND.amber);
    expect(STATUS_COLORS.critical).toBe(EP1_BRAND.red);
    expect(STATUS_COLORS.info).toBe(EP1_BRAND.purple);
    expect(CHART_COLORS.primary).toBe(EP1_BRAND.purple);
  });

  it('contains no Tailwind default palette values', () => {
    // The previous palette was Tailwind's defaults relabelled as the Extreme design
    // system. Guard against regressing to it.
    const tailwindDefaults = [
      '#22c55e',
      '#f59e0b',
      '#ef4444',
      '#3b82f6',
      '#8b5cf6',
      '#06b6d4',
      '#ec4899',
      '#14b8a6',
      '#6366f1',
      '#f97316',
      '#4ade80',
      '#9ca3af',
      '#6b7280',
    ].map((c) => c.toLowerCase());

    const inUse = [
      ...Object.values(EP1_BRAND),
      ...Object.values(EP1_EXTENDED),
      ...Object.values(STATUS_COLORS_LIGHT),
      ...Object.values(PROTOCOL_COLORS),
      ...Object.values(BAND_COLORS),
      ...DONUT_COLORS,
    ].map((c) => c.toLowerCase());

    expect(inUse.filter((c) => tailwindDefaults.includes(c))).toEqual([]);
  });
});
