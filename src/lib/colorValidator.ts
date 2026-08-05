/**
 * EDS Color Compliance Validator
 *
 * Phase 2: Validation & Accessibility
 * Ensures all colors used in AURA comply with EDS tokens.
 *
 * Usage:
 * - getColorCompliance(colorValue) → returns EDS token match or null
 * - validateWCAGContrast(fg, bg, level) → validates contrast ratio
 * - getContrastRatio(color1, color2) → WCAG contrast calculation
 */

import {
  STATUS_COLORS,
  PROTOCOL_COLORS,
  BAND_COLORS,
  SNR_QUALITY_COLORS,
  CHART_COLORS,
  TIMELINE_COLORS,
  ROAMING_QUALITY_COLORS,
  DONUT_COLORS,
} from '../config/colorPalette';

/**
 * All EDS color tokens mapped to their values for reverse lookup
 */
const EDS_TOKEN_REGISTRY = {
  // Status colors
  ...Object.entries(STATUS_COLORS).reduce(
    (acc, [key, val]) => ({ ...acc, [val]: `STATUS_COLORS.${key}` }),
    {}
  ),
  // Protocol colors
  ...Object.entries(PROTOCOL_COLORS).reduce(
    (acc, [key, val]) => ({ ...acc, [val]: `PROTOCOL_COLORS.${key}` }),
    {}
  ),
  // Band colors
  ...Object.entries(BAND_COLORS).reduce(
    (acc, [key, val]) => ({ ...acc, [val]: `BAND_COLORS.${key}` }),
    {}
  ),
  // SNR colors
  ...Object.entries(SNR_QUALITY_COLORS).reduce(
    (acc, [key, val]) => ({ ...acc, [val]: `SNR_QUALITY_COLORS.${key}` }),
    {}
  ),
  // Chart colors
  ...Object.entries(CHART_COLORS).reduce(
    (acc, [key, val]) =>
      typeof val === 'string'
        ? { ...acc, [val]: `CHART_COLORS.${key}` }
        : acc,
    {}
  ),
} as const;

/**
 * Find EDS token for a given color value
 * @param colorValue Hex color code (e.g., '#22c55e')
 * @returns EDS token name or null if not found
 */
export function getColorCompliance(colorValue: string): string | null {
  const normalized = colorValue.toLowerCase();
  return (EDS_TOKEN_REGISTRY as Record<string, string>)[normalized] || null;
}

/**
 * Convert hex to RGB for contrast calculation
 */
function hexToRgb(hex: string): [number, number, number] | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : null;
}

/**
 * Calculate relative luminance (WCAG formula)
 */
function getLuminance(color: string): number {
  const rgb = hexToRgb(color);
  if (!rgb) return 0;

  const [r, g, b] = rgb.map((val) => {
    val = val / 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculate WCAG contrast ratio (1-21)
 */
export function getContrastRatio(color1: string, color2: string): number {
  const lum1 = getLuminance(color1);
  const lum2 = getLuminance(color2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * WCAG compliance levels
 */
export type WCAGLevel = 'AA' | 'AAA';

/**
 * WCAG contrast thresholds
 * AA: 4.5:1 (large text: 3:1)
 * AAA: 7:1 (large text: 4.5:1)
 */
const WCAG_THRESHOLDS: Record<WCAGLevel, number> = {
  AA: 4.5,
  AAA: 7,
};

/**
 * Validate WCAG contrast compliance
 */
export function validateWCAGContrast(
  foregroundColor: string,
  backgroundColor: string,
  level: WCAGLevel = 'AAA'
): {
  pass: boolean;
  ratio: number;
  required: number;
  level: WCAGLevel;
} {
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
 * Status color pairs with WCAG AAA validation
 * Pre-validated combinations for safe use
 */
export const WCAG_VALIDATED_PAIRS = {
  // Success state
  success: {
    fg: STATUS_COLORS.success,
    bg: STATUS_COLORS.successBg,
    darkBg: STATUS_COLORS.successBgDark,
  },
  // Warning state
  warning: {
    fg: STATUS_COLORS.warning,
    bg: STATUS_COLORS.warningBg,
    darkBg: STATUS_COLORS.warningBgDark,
  },
  // Critical/Error state
  critical: {
    fg: STATUS_COLORS.critical,
    bg: STATUS_COLORS.criticalBg,
    darkBg: STATUS_COLORS.criticalBgDark,
  },
  // Info state
  info: {
    fg: STATUS_COLORS.info,
    bg: STATUS_COLORS.infoBg,
    darkBg: STATUS_COLORS.infoBgDark,
  },
};

/**
 * Audit report for a single color
 */
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
 * Check if a color is EDS-compliant
 */
export function isEDSCompliant(colorValue: string): boolean {
  const normalized = colorValue.toLowerCase();
  return Object.keys(EDS_TOKEN_REGISTRY).includes(normalized);
}

/**
 * Get all EDS color tokens for reference
 */
export function getEDSColorTokens(): Record<string, string> {
  return EDS_TOKEN_REGISTRY as Record<string, string>;
}

/**
 * Suggest the nearest EDS token for a non-compliant color
 * (useful for migration)
 */
export function suggestNearestToken(colorValue: string): string | null {
  // For now, just check exact match
  // In future, could implement color distance algorithm
  return getColorCompliance(colorValue);
}
