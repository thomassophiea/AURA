/**
 * AURA Color Palette — Extreme Platform ONE (EP1) brand
 *
 * ## Provenance
 *
 * The source of truth is the **EP1 template values captured in `src/lib/themes.ts`**
 * (the `ep1` theme block, annotated "Exact Extreme Platform ONE template values").
 * Those are the only verified Extreme brand colors available in this repo.
 *
 * Colors below are marked:
 *   [captured] — lifted verbatim from the EP1 template
 *   [derived]  — computed from the captured set to extend the ramp where the
 *                template gave us no value (extra chart hues, light-theme shades).
 *                Derivation preserves hue + saturation and walks lightness until the
 *                color clears its WCAG target. Never invent a "brand" color by eye.
 *
 * Anything not traceable to one of those two categories does not belong in this file.
 *
 * ## Light vs dark
 *
 * EP1 is a dark design language: its colors are tuned for the `#1e1f2a` / `#2d2f3e`
 * surfaces and mostly FAIL contrast on white. So each semantic token ships two values:
 *
 *   TOKEN        -> EP1 base, for dark / ep1 / dev themes
 *   TOKEN_LIGHT  -> hue-matched darkened variant, for the light theme on white
 *
 * Use `resolveStatusColor()` / `resolveChartColor()` to pick, or read the
 * `--status-*` CSS variables which `applyTheme()` already sets per theme.
 *
 * ## Contrast
 *
 * Ratios in comments are computed, not estimated (WCAG 2.1 relative luminance), and are
 * enforced by `colorPalette.test.ts` — if you change a value here and it drops below its
 * threshold, that test fails. Do not update the comment to match a regression.
 * Note WCAG thresholds: 4.5:1 AA text, 7:1 AAA text, 3:1 non-text/graphical (1.4.11).
 * Chart fills and strokes are graphical objects — 3:1 is the bar, not 4.5:1.
 */

/**
 * EP1 brand primitives — [captured] verbatim from the EP1 template.
 * This is the root of the palette. Everything else derives from it.
 */
export const EP1_BRAND = {
  /** Interactive purple — the Extreme brand accent */
  purple: '#8981e5',
  purpleLight: '#aba3fb',
  purpleActive: '#7b74d4',
  /** Deep navy — text on brand, and the info surface */
  navy: '#1e1a46',

  green: '#75bf63',
  amber: '#E5B85C',
  red: '#ed5f56',

  /** Neutrals */
  textPrimary: '#f8f8fb',
  textSecondary: '#D7D9E6',
  textMuted: '#babcce',
  textDisabled: '#7C8098',

  /** Surfaces */
  bgBase: '#1e1f2a',
  bgSecondary: '#1D2033',
  surface: '#2d2f3e',
  surfaceRaised: '#323650',
  surfaceElevated: '#343852',
} as const;

/**
 * Status / health colors.
 *
 * Base values are the EP1 semantic hues, tuned for dark surfaces.
 * Verified on `#1e1f2a`: success 7.31:1 AAA · warning 8.83:1 AAA ·
 * critical 4.96:1 AA · info 4.93:1 AA.
 */
export const STATUS_COLORS = {
  success: EP1_BRAND.green, // [captured]
  successBg: '#f4faf2', // [derived] light-theme tint
  successBgDark: '#13240f', // [derived] 7.30:1 vs base
  successBgEp1: '#1E3D1A', // [captured] 5.40:1 vs base

  warning: EP1_BRAND.amber, // [captured]
  warningBg: '#fbf8f1', // [derived]
  warningBgDark: '#281e0b', // [derived] 8.86:1 vs base
  warningBgEp1: '#3D2E10', // [captured] 7.10:1 vs base

  critical: EP1_BRAND.red, // [captured]
  criticalBg: '#fbf1f1', // [derived]
  criticalBgDark: '#280d0b', // [derived] 5.53:1 vs base
  criticalBgEp1: '#3D1A1E', // [captured] 4.67:1 vs base

  info: EP1_BRAND.purple, // [captured]
  infoBg: '#f2f1fb', // [derived]
  infoBgDark: '#0e0b28', // [derived] 5.77:1 vs base
  infoBgEp1: EP1_BRAND.navy, // [captured] 4.91:1 vs base
} as const;

/**
 * Light-theme status foregrounds — [derived].
 *
 * Same hue and saturation as the EP1 base, darkened until they clear 4.5:1 on
 * white AND 4.5:1 on their own tint background. The EP1 base colors cannot be
 * used on white (success is 2.24:1, warning 1.85:1 — both fail even 3:1).
 *
 * Verified: success 4.80:1 · warning 4.80:1 · critical 5.00:1 · info 5.07:1 (on white).
 */
export const STATUS_COLORS_LIGHT = {
  success: '#438035',
  warning: '#946b18',
  critical: '#d92317',
  info: '#665cdd',
} as const;

/**
 * Extended chart hues — [derived].
 *
 * The EP1 template supplied four semantic hues plus the purple family. Charts need
 * more separable series than that, so these four fill the gaps. They are built to the
 * EP1 envelope (S 45-70%, L 55-65%) so they read as the same family, and each clears
 * 3:1 as a graphical object on the EP1 base surface.
 *
 * Verified on `#1e1f2a`: teal 7.57:1 · orange 6.85:1 · pink 5.47:1 · slate 6.17:1 ·
 * orchid 4.24:1.
 */
export const EP1_EXTENDED = {
  teal: '#59c0c0',
  orange: '#e3965f',
  pink: '#d279a6',
  slate: '#7da1d4',
  /**
   * Chosen by searching the EP1 envelope (S 35-55%, L 55-68%) for the hue with the
   * greatest minimum perceptual distance from the other nine categorical colors.
   * Lands at ΔE 37.9 from its nearest neighbour. Exists because the tenth donut slot
   * previously reused `purpleActive`, which sits ΔE 5.4 from the brand purple — close
   * enough to read as the same slice.
   */
  orchid: '#c94fc9',
} as const;

/** Light-theme companions for the extended hues — [derived], all ≥4.5:1 on white. */
export const EP1_EXTENDED_LIGHT = {
  teal: '#307d7d',
  orange: '#ae5a1e',
  pink: '#be407f',
  slate: '#3d71ba',
  orchid: '#c13bc1',
} as const;

/**
 * Wi-Fi protocol colors.
 * Newest standard carries the brand purple; older standards step down the ramp.
 */
export const PROTOCOL_COLORS = {
  be: EP1_BRAND.purple, // [captured] Wi-Fi 7 — brand accent for the newest standard
  ax: EP1_EXTENDED.teal, // [derived]  Wi-Fi 6
  ac: EP1_BRAND.green, // [captured] Wi-Fi 5
  n: EP1_BRAND.amber, // [captured] Wi-Fi 4
  legacy: EP1_BRAND.textMuted, // [captured] Legacy A/B/G — muted, de-emphasised
  other: EP1_BRAND.textDisabled, // [captured] Unknown
} as const;

/** Light-theme protocol companions — [derived]. */
export const PROTOCOL_COLORS_LIGHT = {
  be: '#7066df',
  ax: EP1_EXTENDED_LIGHT.teal,
  ac: STATUS_COLORS_LIGHT.success,
  n: STATUS_COLORS_LIGHT.warning,
  legacy: '#707499',
  other: '#71758f',
} as const;

/**
 * Network band colors — all [captured].
 * 6 GHz gets the brand purple as the newest spectrum.
 */
export const BAND_COLORS = {
  '2.4': EP1_BRAND.amber,
  '5': EP1_BRAND.green,
  '6': EP1_BRAND.purple,
} as const;

/** Light-theme band companions — [derived]. */
export const BAND_COLORS_LIGHT = {
  '2.4': STATUS_COLORS_LIGHT.warning,
  '5': STATUS_COLORS_LIGHT.success,
  '6': STATUS_COLORS_LIGHT.info,
} as const;

/**
 * Signal quality (SNR) ramp — all [captured].
 * Monotonic good → bad: green → purple → amber → red.
 */
export const SNR_QUALITY_COLORS = {
  excellent: EP1_BRAND.green, // SNR >= 40 dB
  good: EP1_BRAND.purple, // SNR 25-40 dB
  fair: EP1_BRAND.amber, // SNR 15-25 dB
  poor: EP1_BRAND.red, // SNR < 15 dB
} as const;

/**
 * Chart data series colors.
 */
export const CHART_COLORS = {
  primary: EP1_BRAND.purple, // [captured]
  secondary: EP1_BRAND.purpleLight, // [captured]

  series: {
    total: EP1_BRAND.purple,
    upload: EP1_EXTENDED.teal,
    download: EP1_EXTENDED.pink,
    available: EP1_BRAND.amber,
    clientData: EP1_BRAND.purpleLight,
    coChannel: EP1_EXTENDED.teal,
    interference: EP1_BRAND.purple,
    r1: EP1_BRAND.purple,
    r2: EP1_EXTENDED.teal,
    r3: EP1_EXTENDED.pink,
  },

  success: EP1_BRAND.green,
  warning: EP1_BRAND.amber,
  error: EP1_BRAND.red,
  info: EP1_BRAND.purple,

  // Named hues, EP1 family
  purple: EP1_BRAND.purple,
  purpleLight: EP1_BRAND.purpleLight,
  green: EP1_BRAND.green,
  amber: EP1_BRAND.amber,
  red: EP1_BRAND.red,
  teal: EP1_EXTENDED.teal,
  orange: EP1_EXTENDED.orange,
  pink: EP1_EXTENDED.pink,
  slate: EP1_EXTENDED.slate,
} as const;

/**
 * Timeline / reference-line colors.
 * Unlocked tracks in the base brand purple; locked steps up to the brighter tint
 * so a pinned cursor reads as more prominent than a following one.
 */
export const TIMELINE_COLORS = {
  cursorUnlocked: EP1_BRAND.purple, // [captured]
  cursorUnlockedOpacity: 0.5,
  cursorUnlockedDasharray: '4 4',

  cursorLocked: EP1_BRAND.purpleLight, // [captured]
  cursorLockedOpacity: 1,
  cursorLockedDasharray: undefined, // Solid line

  timeWindowFill: 'var(--primary)', // Theme-aware
  timeWindowFillOpacity: 0.15,
  timeWindowStroke: 'var(--primary)',
  timeWindowStrokeOpacity: 0.3,
} as const;

/**
 * Roaming quality score colors.
 * Warm ramp: green → amber → orange → red.
 */
export const ROAMING_QUALITY_COLORS = {
  good: { hex: EP1_BRAND.green, rgba: 'rgba(117,191,99,0.9)' }, // >= 80  [captured]
  fair: { hex: EP1_BRAND.amber, rgba: 'rgba(229,184,92,0.9)' }, // 60-80  [captured]
  poor: { hex: EP1_EXTENDED.orange, rgba: 'rgba(227,150,95,0.9)' }, // 40-60  [derived]
  critical: { hex: EP1_BRAND.red, rgba: 'rgba(237,95,86,0.9)' }, // < 40   [captured]
} as const;

/**
 * Categorical ramp — the ordered list to cycle through for pie slices, series lines,
 * app-category legends, and anything else that needs N visually distinct colors.
 *
 * The constraint here is perceptual separability (ΔE in CIELAB), not contrast ratio:
 * two colors can share a luminance and still be obviously different hues. Contrast is
 * the wrong tool for "can I tell these two slices apart".
 *
 * Construction: the four captured EP1 semantic hues anchor the ramp; the rest fill gaps
 * around the wheel at EP1's own saturation/lightness envelope (S 40-55%, L 55-66%) so
 * they read as one family. Ordered so the earliest entries are the most brand-forward —
 * a 3-slice chart gets purple/green/amber, not three derived colors.
 *
 * Verified: minimum pairwise ΔE 13.1, well above the ~2.3 just-noticeable threshold;
 * every color clears 3:1 as a graphical object on the EP1 base surface. Enforced in
 * `colorPalette.test.ts`.
 */
export const EP1_CATEGORICAL = [
  EP1_BRAND.purple, // [captured]
  EP1_BRAND.green, // [captured]
  EP1_BRAND.amber, // [captured]
  EP1_BRAND.red, // [captured]
  EP1_EXTENDED.teal, // [derived]
  EP1_BRAND.purpleLight, // [captured]
  EP1_EXTENDED.orange, // [derived]
  EP1_EXTENDED.pink, // [derived]
  EP1_EXTENDED.slate, // [derived]
  EP1_EXTENDED.orchid, // [derived]
  '#67c19b', // [derived] mint
  '#6cafd0', // [derived] sky
  '#ab81cf', // [derived] violet
  '#ca7288', // [derived] rose
] as const;

/** Light-theme companions for the categorical ramp — [derived], all ≥4.5:1 on white. */
export const EP1_CATEGORICAL_LIGHT = [
  '#7066df',
  '#438035',
  '#946b18',
  '#d92317',
  '#307d7d',
  '#6d5ff8',
  '#ae5a1e',
  '#be407f',
  '#3d71ba',
  '#c13bc1',
  '#368463',
  '#347ea3',
  '#945ec2',
  '#be536e',
] as const;

/**
 * Donut / pie palette — the first ten of the categorical ramp.
 *
 * A donut wraps, so the last entry sits against the first; both ends of this slice are
 * checked for collision in the tests. `purpleActive` is deliberately absent — it sits
 * ΔE 5.4 from the brand purple and read as the same slice.
 */
export const DONUT_COLORS = EP1_CATEGORICAL.slice(0, 10);

/** Themes that render on EP1-style dark surfaces. */
const DARK_THEMES = new Set(['dark', 'ep1', 'dev']);

export type PaletteTheme = 'light' | 'default' | 'dark' | 'ep1' | 'dev';

/** True when the theme paints on a dark surface and should use EP1 base values. */
export function isDarkSurface(theme: PaletteTheme): boolean {
  return DARK_THEMES.has(theme);
}

/**
 * Pick the contrast-correct status color for a theme.
 *
 * On dark surfaces returns the EP1 base; on light returns the darkened variant.
 * Prefer this over reading `STATUS_COLORS.x` directly anywhere the value lands on a
 * theme-dependent background.
 */
export function resolveStatusColor(
  token: keyof typeof STATUS_COLORS_LIGHT,
  theme: PaletteTheme = 'light'
): string {
  return isDarkSurface(theme) ? STATUS_COLORS[token] : STATUS_COLORS_LIGHT[token];
}

/** Theme-correct band color. */
export function resolveBandColor(
  band: keyof typeof BAND_COLORS,
  theme: PaletteTheme = 'light'
): string {
  return isDarkSurface(theme) ? BAND_COLORS[band] : BAND_COLORS_LIGHT[band];
}

/**
 * Pick a categorical color by index, wrapping, contrast-correct for the theme.
 * Use this for chart series and category legends rather than indexing the ramps directly.
 */
export function resolveCategoricalColor(index: number, theme: PaletteTheme = 'light'): string {
  const ramp = isDarkSurface(theme) ? EP1_CATEGORICAL : EP1_CATEGORICAL_LIGHT;
  // Guard against negative or fractional indices reaching the array.
  const safe = Math.abs(Math.floor(index)) % ramp.length;
  return ramp[safe];
}

/** Theme-correct Wi-Fi protocol color. */
export function resolveProtocolColor(
  protocol: keyof typeof PROTOCOL_COLORS,
  theme: PaletteTheme = 'light'
): string {
  return isDarkSurface(theme) ? PROTOCOL_COLORS[protocol] : PROTOCOL_COLORS_LIGHT[protocol];
}

/**
 * Status background for a theme variant.
 *
 * @param baseColor - semantic token
 * @param theme - 'light' | 'dark' | 'ep1'
 */
export function getColorByTheme(
  baseColor: 'success' | 'warning' | 'critical' | 'info',
  theme: 'light' | 'dark' | 'ep1' = 'light'
): string {
  const suffix = theme === 'light' ? '' : theme === 'dark' ? 'Dark' : 'Ep1';
  const bgKey = `${baseColor}Bg${suffix}` as keyof typeof STATUS_COLORS;
  return STATUS_COLORS[bgKey] || STATUS_COLORS[baseColor];
}

/** Validate a 6-digit hex color. */
export function isValidColor(color: string): boolean {
  return /^#[0-9A-F]{6}$/i.test(color);
}
