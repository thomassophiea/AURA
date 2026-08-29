/**
 * Inline Wi-Fi 7 visualization primitives, consumed next to the controls they
 * annotate: the AFC power bar in the AP radio editor and the band/power badges
 * in the AP + profile network config. Colors come from the shared EP1 palette
 * (`BAND_COLORS`: 2.4 GHz amber, 5 GHz green, 6 GHz purple), resolved per theme.
 */
import React from 'react';
import { Sparkles, Zap } from 'lucide-react';
import type { PowerMode6, Wifi7Band, Wifi7Radio } from '../../types/wifi7';
import { POWER_MODE6 } from '../../types/wifi7';
import {
  BAND_COLORS,
  resolveBandColor,
  resolveStatusColor,
  type PaletteTheme,
} from '../../config/colorPalette';
import { usePaletteTheme } from '../../hooks/usePaletteTheme';
import { withAlpha } from '../../lib/chartStyle';

const BAND_KEY: Record<Wifi7Band, keyof typeof BAND_COLORS> = {
  '2.4GHz': '2.4',
  '5GHz': '5',
  '6GHz': '6',
};

/** Theme-correct accent color for a Wi-Fi 7 band. */
export function bandAccent(band: Wifi7Band, theme: PaletteTheme): string {
  return resolveBandColor(BAND_KEY[band], theme);
}

/** Chip styling (tinted bg, ring, accent text) built from one accent color. */
function chipStyle(accent: string): React.CSSProperties {
  return {
    color: accent,
    backgroundColor: withAlpha(accent, 0.1),
    boxShadow: `inset 0 0 0 1px ${withAlpha(accent, 0.3)}`,
  };
}

export function BandBadge({ band, eht }: { band: Wifi7Band; eht?: boolean }) {
  const theme = usePaletteTheme();
  const accent = bandAccent(band, theme);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium"
      style={chipStyle(accent)}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
      {band}
      {eht && <Sparkles className="h-3 w-3" aria-label="802.11be / Wi-Fi 7" />}
    </span>
  );
}

export function PowerModeBadge({ mode }: { mode: PowerMode6 | string }) {
  const theme = usePaletteTheme();
  const meta = POWER_MODE6[mode as PowerMode6];
  const sp = meta?.standardPower;
  // Standard power is a 6 GHz / AFC affordance — carry the 6 GHz band accent;
  // low-power indoor reads as the healthy default.
  const accent = sp ? bandAccent('6GHz', theme) : resolveStatusColor('success', theme);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium"
      style={chipStyle(accent)}
    >
      {sp && <Zap className="h-3 w-3" />}
      {meta?.short ?? String(mode)}
    </span>
  );
}

/**
 * AFC power bar — actual txPower filled against the txMaxPower ceiling. The
 * unfilled remainder is the AFC/SmartRF cap (power the radio is not using).
 */
export function AfcPowerBar({ radio }: { radio: Wifi7Radio }) {
  const theme = usePaletteTheme();
  const ceiling = Math.max(radio.txMaxPower, radio.txPower, 1);
  const pct = Math.round((radio.txPower / ceiling) * 100);
  const capped = radio.powerCapDb > 0;
  const fill = radio.standardPower
    ? bandAccent('6GHz', theme)
    : resolveStatusColor('success', theme);
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{radio.txPower} dBm</span>
        {capped && (
          <span style={{ color: 'var(--status-warning)' }}>−{radio.powerCapDb} dB cap</span>
        )}
        <span>max {radio.txMaxPower}</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: fill }}
        />
      </div>
    </div>
  );
}
