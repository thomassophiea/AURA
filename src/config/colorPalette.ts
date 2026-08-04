/**
 * AURA Standardized Color Palette
 *
 * Central configuration for all visualization colors across insights dashboards.
 * All colors are theme-aware and coordinate across:
 * - Health/status indicators (good/warning/critical)
 * - Wi-Fi protocol visualization
 * - Network band identification
 * - Data visualization charts
 *
 * This ensures visual consistency and brand alignment across all AURA components.
 */

/**
 * Status/Health State Colors
 * Used for indicators, badges, and health visualizations
 */
export const STATUS_COLORS = {
  // Healthy/Good state
  success: '#22c55e',
  successBg: '#f0fdf4',
  successBgDark: '#052e16',
  successBgEp1: '#1E3D1A',

  // Warning/Caution state
  warning: '#f59e0b',
  warningBg: '#fffbeb',
  warningBgDark: '#451a03',
  warningBgEp1: '#3D2E10',

  // Critical/Error state
  critical: '#ef4444',
  criticalBg: '#fef2f2',
  criticalBgDark: '#450a0a',
  criticalBgEp1: '#3D1A1E',

  // Information/Neutral state
  info: '#3b82f6',
  infoBg: '#eff6ff',
  infoBgDark: '#172554',
  infoBgEp1: '#1e1a46',
} as const;

/**
 * Wi-Fi Protocol Colors
 * Consistent identification across all protocol visualizations
 */
export const PROTOCOL_COLORS = {
  be: '#8981e5', // Wi-Fi 7 - Violet/Indigo
  ax: '#3b82f6', // Wi-Fi 6 - Blue
  ac: '#14b8a6', // Wi-Fi 5 - Teal
  n: '#f59e0b', // Wi-Fi 4 - Amber
  legacy: '#9ca3af', // Legacy A/B/G - Gray
  other: '#6b7280', // Other - Dark Gray
} as const;

/**
 * Network Band Colors
 * Standard colors for 2.4 GHz, 5 GHz, and 6 GHz bands
 */
export const BAND_COLORS = {
  '2.4': '#f59e0b', // 2.4 GHz - Amber
  '5': '#22c55e', // 5 GHz - Green (changed from blue for consistency)
  '6': '#8b5cf6', // 6 GHz - Purple
} as const;

/**
 * Signal Quality/SNR Distribution Colors
 * Maps SNR ranges to visual quality indicators
 */
export const SNR_QUALITY_COLORS = {
  excellent: '#22c55e', // SNR >= 40 dB - Green (good)
  good: '#3b82f6', // SNR 25-40 dB - Blue (info)
  fair: '#f59e0b', // SNR 15-25 dB - Amber (warning)
  poor: '#ef4444', // SNR < 15 dB - Red (critical)
} as const;

/**
 * Chart Data Series Colors
 * Used for multi-series visualizations (throughput, power, clients, etc.)
 */
export const CHART_COLORS = {
  // Primary series
  primary: '#3b82f6', // Blue
  secondary: '#8b5cf6', // Purple

  // Multi-series palette (throughput split, channel utilization)
  series: {
    total: '#3b82f6', // Blue - Total/primary metric
    upload: '#06b6d4', // Cyan - Upload/outbound
    download: '#ec4899', // Pink - Download/inbound
    available: '#f59e0b', // Amber - Available resources
    clientData: '#8b5cf6', // Purple - Client activity
    coChannel: '#06b6d4', // Cyan - Co-channel interference
    interference: '#3b82f6', // Blue - Interference
    r1: '#3b82f6', // Blue - Radio 1
    r2: '#06b6d4', // Cyan - Radio 2
    r3: '#ec4899', // Pink - Radio 3
  },

  // Status-based colors
  success: '#22c55e', // Green
  warning: '#f59e0b', // Amber
  error: '#ef4444', // Red
  info: '#3b82f6', // Blue

  // Chart gradient colors
  blue: '#3b82f6',
  cyan: '#06b6d4',
  purple: '#8b5cf6',
  pink: '#ec4899',
  amber: '#f59e0b',
  green: '#22c55e',
  red: '#ef4444',
  indigo: '#6366f1',
  teal: '#14b8a6',
} as const;

/**
 * Timeline/Reference Line Colors
 * Used for chart cursor tracking and time window selections
 */
export const TIMELINE_COLORS = {
  // Chart cursor/reference line - unlocked (tracking)
  cursorUnlocked: '#3b82f6', // Blue
  cursorUnlockedOpacity: 0.5,
  cursorUnlockedDasharray: '4 4',

  // Chart cursor/reference line - locked (fixed point)
  cursorLocked: '#8b5cf6', // Purple
  cursorLockedOpacity: 1,
  cursorLockedDasharray: undefined, // Solid line

  // Time window highlight
  timeWindowFill: 'var(--primary)', // Theme-aware fill
  timeWindowFillOpacity: 0.15,
  timeWindowStroke: 'var(--primary)', // Theme-aware stroke
  timeWindowStrokeOpacity: 0.3,
} as const;

/**
 * Roaming Quality Score Colors
 * Maps connectivity health scores to visual states
 */
export const ROAMING_QUALITY_COLORS = {
  good: { hex: '#4ade80', rgba: 'rgba(74,222,128,0.9)' }, // Green - >= 80
  fair: { hex: '#f59e0b', rgba: 'rgba(251,191,36,0.9)' }, // Amber - 60-80
  poor: { hex: '#f97316', rgba: 'rgba(249,115,22,0.9)' }, // Orange - 40-60
  critical: { hex: '#ef4444', rgba: 'rgba(239,68,68,0.9)' }, // Red - < 40
} as const;

/**
 * Donut/Pie Chart Color Palette
 * Extended palette for cycling through categories (app groups, services, etc.)
 */
export const DONUT_COLORS = [
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#22c55e', // Green
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#f97316', // Orange
  '#ec4899', // Pink
  '#6366f1', // Indigo
  '#14b8a6', // Teal
] as const;

/**
 * Get color by theme
 * Provides theme-specific colors for components that need different shades
 *
 * @param baseColor - The base color token (e.g., 'success', 'warning')
 * @param theme - Theme variant: 'light', 'dark', or 'ep1'
 * @returns Color value appropriate for the theme
 */
export function getColorByTheme(
  baseColor: 'success' | 'warning' | 'critical' | 'info',
  theme: 'light' | 'dark' | 'ep1' = 'light'
): string {
  const colorKey = baseColor as keyof typeof STATUS_COLORS;
  const bgKey = `${baseColor}Bg${theme === 'light' ? '' : theme === 'dark' ? 'Dark' : 'Ep1'}` as keyof typeof STATUS_COLORS;

  return STATUS_COLORS[bgKey] || STATUS_COLORS[colorKey];
}

/**
 * Validate color format
 * Ensures color values are properly formatted hex codes
 */
export function isValidColor(color: string): boolean {
  return /^#[0-9A-F]{6}$/i.test(color);
}
