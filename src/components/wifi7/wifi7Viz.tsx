/**
 * Presentational visualization primitives for the Wi-Fi 7 page. Pure — props in,
 * SVG/JSX out, no data fetching. Reused across the Overview, MLO and AFC tabs.
 */
import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Sparkles, Zap } from 'lucide-react';
import type { ClientProtocolStat, PowerMode6, Wifi7Ap, Wifi7Band, Wifi7Radio } from '../../types/wifi7';
import { POWER_MODE6 } from '../../types/wifi7';

/** Per-band accent classes (background / text / ring). */
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
 * EHT capability matrix: APs × the three bands. Each cell reflects the real
 * radio state — EHT (802.11be) capable, AFC, and 6 GHz power mode.
 */
export function EhtRadioMatrix({ aps }: { aps: Wifi7Ap[] }) {
  const bands: Wifi7Band[] = ['2.4GHz', '5GHz', '6GHz'];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-separate border-spacing-y-1 text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-2 py-1 font-medium">Access Point</th>
            {bands.map((b) => (
              <th key={b} className="px-2 py-1 font-medium">
                <BandBadge band={b} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {aps.map((ap) => (
            <tr key={ap.serialNumber} className="rounded-md">
              <td className="px-2 py-1.5">
                <div className="font-medium text-foreground">{ap.apName}</div>
                <div className="text-xs text-muted-foreground">{ap.model}</div>
              </td>
              {bands.map((band) => {
                const r = ap.radios.find((x) => x.band === band);
                if (!r) return <td key={band} className="px-2 py-1.5 text-muted-foreground">—</td>;
                return (
                  <td key={band} className="px-2 py-1.5">
                    <div className="flex flex-wrap items-center gap-1">
                      <span
                        className={`rounded px-1 text-xs font-semibold ${
                          r.eht ? 'text-indigo-600 dark:text-indigo-400' : 'text-muted-foreground'
                        }`}
                      >
                        {r.eht ? '11be' : r.mode || 'legacy'}
                      </span>
                      {band === '6GHz' && <PowerModeBadge mode={r.pwrMode6} />}
                      {r.afc && (
                        <span className="rounded bg-amber-500/10 px-1 text-xs font-medium text-amber-600 ring-1 ring-inset ring-amber-500/30 dark:text-amber-400">
                          AFC
                        </span>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface EirpDatum {
  name: string;
  used: number;
  cap: number;
  standardPower: boolean;
}

/** EIRP-by-radio chart for 6 GHz radios: stacked used power + AFC/SmartRF cap. */
export function EirpChart({ radios }: { radios: Array<Wifi7Radio & { apName: string }> }) {
  const data = useMemo<EirpDatum[]>(
    () =>
      radios.map((r) => ({
        name: `${r.apName}`,
        used: r.txPower,
        cap: r.powerCapDb,
        standardPower: r.standardPower,
      })),
    [radios]
  );
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No 6 GHz radios found.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 42)}>
      <BarChart data={data} layout="vertical" margin={{ left: 24, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
        <XAxis type="number" domain={[0, 'dataMax']} unit=" dBm" tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(value, name) => {
            const v = Number(value ?? 0);
            return [`${v} dB${name === 'used' ? 'm used' : ' capped'}`, ''] as [string, string];
          }}
          contentStyle={{ fontSize: 12 }}
        />
        <Bar dataKey="used" stackId="p" radius={[3, 0, 0, 3]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.standardPower ? '#6366f1' : '#10b981'} />
          ))}
        </Bar>
        <Bar dataKey="cap" stackId="p" radius={[0, 3, 3, 0]} fill="#f59e0b" fillOpacity={0.35} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Client 802.11be readiness bars from live station protocol distribution. */
export function ClientProtocolBars({ stats }: { stats: ClientProtocolStat[] }) {
  const total = stats.reduce((n, s) => n + s.count, 0) || 1;
  return (
    <div className="space-y-2">
      {stats.map((s) => (
        <div key={s.protocol} className="flex items-center gap-2 text-sm">
          <span className="w-24 shrink-0 text-xs text-muted-foreground">{s.protocol}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${s.eht ? 'bg-indigo-500' : 'bg-slate-400 dark:bg-slate-500'}`}
              style={{ width: `${Math.round((s.count / total) * 100)}%` }}
            />
          </div>
          <span className="w-8 text-right tabular-nums text-xs">{s.count}</span>
        </div>
      ))}
      {stats.length === 0 && (
        <p className="text-sm text-muted-foreground">No clients associated.</p>
      )}
    </div>
  );
}
