/**
 * Shared Recharts styling primitives.
 *
 * One source for the compact tooltip and axis-tick styles that the insight
 * panels used to each copy locally — import from here instead of redefining
 * per component so chart chrome stays consistent and theme-correct.
 */
import type { CSSProperties } from 'react';

/** Compact tooltip styling for dense insight charts. */
export const COMPACT_TOOLTIP_STYLE: CSSProperties = {
  backgroundColor: 'color-mix(in srgb, var(--background) 90%, transparent)',
  border: '1px solid color-mix(in srgb, var(--border) 30%, transparent)',
  borderRadius: '4px',
  padding: '4px 6px',
  fontSize: '9px',
  backdropFilter: 'blur(8px)',
};

/** Standard axis tick style — theme-correct muted fill, never a raw white rgba. */
export const AXIS_TICK: { fill: string; fontSize: number } = {
  fill: 'var(--muted-foreground)',
  fontSize: 11,
};

/** hex (#rrggbb) → rgba() string at the given alpha, for palette-derived tints. */
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
