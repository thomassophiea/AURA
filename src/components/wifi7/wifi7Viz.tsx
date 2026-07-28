/**
 * Inline Wi-Fi 7 visualization primitives, consumed next to the controls they
 * annotate: the AFC power bar in the AP radio editor and the band/power badges
 * in the AP + profile network config. Pure — props in, JSX out.
 */
import React from 'react';
import { Sparkles, Zap } from 'lucide-react';
import type { PowerMode6, Wifi7Band, Wifi7Radio } from '../../types/wifi7';
import { POWER_MODE6 } from '../../types/wifi7';

/** Per-band accent classes. */
export const BAND_STYLE: Record<Wifi7Band, { dot: string; text: string; chip: string }> = {
  '2.4GHz': { dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', chip: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/30' },
  '5GHz': { dot: 'bg-sky-500', text: 'text-sky-600 dark:text-sky-400', chip: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-sky-500/30' },
  '6GHz': { dot: 'bg-indigo-500', text: 'text-indigo-600 dark:text-indigo-400', chip: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 ring-indigo-500/30' },
};

export function BandBadge({ band, eht }: { band: Wifi7Band; eht?: boolean }) {
  const s = BAND_STYLE[band];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${s.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {band}
      {eht && <Sparkles className="h-3 w-3" aria-label="802.11be / Wi-Fi 7" />}
    </span>
  );
}

export function PowerModeBadge({ mode }: { mode: PowerMode6 | string }) {
  const meta = POWER_MODE6[mode as PowerMode6];
  const sp = meta?.standardPower;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
        sp
          ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 ring-indigo-500/30'
          : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/30'
      }`}
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
  const ceiling = Math.max(radio.txMaxPower, radio.txPower, 1);
  const pct = Math.round((radio.txPower / ceiling) * 100);
  const capped = radio.powerCapDb > 0;
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{radio.txPower} dBm</span>
        {capped && <span className="text-amber-600 dark:text-amber-400">−{radio.powerCapDb} dB cap</span>}
        <span>max {radio.txMaxPower}</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${radio.standardPower ? 'bg-indigo-500' : 'bg-emerald-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
