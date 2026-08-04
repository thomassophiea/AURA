/**
 * ClientProtocolWidget — breaks the connected client population down by the
 * Wi-Fi protocol generation each client is using (Wi-Fi 7 / 6 / 5 / 4 / Legacy),
 * with client count, throughput, average signal and a per-band split.
 *
 * Pure bucketing/aggregation helpers are exported for unit testing.
 */
import { memo, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Radio, Users } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { Station } from '../../hooks/useDashboardData';
import { PROTOCOL_COLORS } from '../../config/colorPalette';

type ProtocolKey = 'be' | 'ax' | 'ac' | 'n' | 'legacy' | 'other';

interface ProtocolMeta {
  gen: string;
  code: string;
  color: string;
}

// Fixed generation registry — uses standardized PROTOCOL_COLORS from centralized palette
// Ensures visual consistency across all protocol visualizations in AURA
export const PROTOCOL_META: Record<ProtocolKey, ProtocolMeta> = {
  be: { gen: 'Wi‑Fi 7', code: 'BE', color: PROTOCOL_COLORS.be }, // Violet/Indigo
  ax: { gen: 'Wi‑Fi 6', code: 'AX', color: PROTOCOL_COLORS.ax }, // Blue
  ac: { gen: 'Wi‑Fi 5', code: 'AC', color: PROTOCOL_COLORS.ac }, // Teal
  n: { gen: 'Wi‑Fi 4', code: 'N', color: PROTOCOL_COLORS.n }, // Amber
  legacy: { gen: 'Legacy', code: 'A/B/G', color: PROTOCOL_COLORS.legacy }, // Gray
  other: { gen: 'Other', code: '—', color: PROTOCOL_COLORS.other }, // Dark Gray
};

const PROTOCOL_ORDER: ProtocolKey[] = ['be', 'ax', 'ac', 'n', 'legacy', 'other'];

export interface ProtocolBucket extends ProtocolMeta {
  key: ProtocolKey;
  count: number;
  countPct: number;
  throughputMbps: number;
  throughputPct: number;
  avgSignal: number | null;
  bands: { '2.4': number; '5': number; '6': number };
  topBand: string;
}

/** Map a raw controller protocol string to a Wi-Fi generation bucket. */
export function bucketProtocol(protocol?: string): ProtocolKey {
  const suffix = (protocol ?? '')
    .toLowerCase()
    .replace(/\s/g, '')
    .replace(/^802\.?11/, '');
  if (!suffix) return 'other';
  if (suffix.includes('be')) return 'be';
  if (suffix.includes('ax')) return 'ax';
  if (suffix.includes('ac')) return 'ac';
  if (suffix.includes('n')) return 'n'; // n, bgn, gn, ngn
  if (/^[abg]+$/.test(suffix)) return 'legacy'; // a / b / g combos only
  return 'other';
}

/** Normalize a controller rate to bits/s (matches useDashboardData convention). */
function normalizeRate(r?: number): number {
  if (!r || r <= 0) return 0;
  return r > 1000 ? r : r * 1_000_000;
}

/** Best-effort band derivation from radioId, then channel. Returns null if unknown. */
function deriveBand(station: Station): '2.4' | '5' | '6' | null {
  const rid = station.radioId;
  if (rid === 1) return '2.4';
  if (rid === 2) return '5';
  if (rid === 3) return '6';
  const ch = station.channel;
  if (ch !== undefined && ch !== null && ch !== '') {
    const raw = String(ch).toLowerCase();
    if (raw.includes('e')) return '6'; // 6E / PSC-style marker
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n > 0) {
      if (n >= 1 && n <= 14) return '2.4';
      if (n > 177) return '6';
      return '5';
    }
  }
  return null;
}

/** Aggregate stations into per-protocol buckets, sorted by client count desc. */
export function aggregateProtocols(stations: Station[]): ProtocolBucket[] {
  const acc = new Map<
    ProtocolKey,
    { count: number; bits: number; signalSum: number; signalCount: number; bands: Record<string, number> }
  >();

  let totalBits = 0;

  for (const station of stations) {
    const key = bucketProtocol(station.protocol);
    const entry =
      acc.get(key) ??
      { count: 0, bits: 0, signalSum: 0, signalCount: 0, bands: { '2.4': 0, '5': 0, '6': 0 } };

    entry.count += 1;

    const bits = normalizeRate(station.receivedRate) + normalizeRate(station.transmittedRate);
    entry.bits += bits;
    totalBits += bits;

    const signal = station.rssi ?? station.rss ?? 0;
    if (signal < 0) {
      entry.signalSum += signal;
      entry.signalCount += 1;
    }

    const band = deriveBand(station);
    if (band) entry.bands[band] += 1;

    acc.set(key, entry);
  }

  const total = stations.length;

  return PROTOCOL_ORDER.filter((key) => acc.has(key))
    .map((key) => {
      const e = acc.get(key)!;
      const bands = { '2.4': e.bands['2.4'], '5': e.bands['5'], '6': e.bands['6'] };
      const topBandEntry = (Object.entries(bands) as Array<[string, number]>)
        .filter(([, c]) => c > 0)
        .sort((a, b) => b[1] - a[1])[0];
      return {
        key,
        ...PROTOCOL_META[key],
        count: e.count,
        countPct: total > 0 ? Math.round((e.count / total) * 100) : 0,
        throughputMbps: e.bits / 1_000_000,
        throughputPct: totalBits > 0 ? Math.round((e.bits / totalBits) * 100) : 0,
        avgSignal: e.signalCount > 0 ? Math.round(e.signalSum / e.signalCount) : null,
        bands,
        topBand: topBandEntry ? `${topBandEntry[0]} GHz` : '—',
      };
    })
    .sort((a, b) => b.count - a.count);
}

const fmtMbps = (mbps: number): string =>
  mbps >= 1000 ? `${(mbps / 1000).toFixed(1)} Gbps` : `${mbps.toFixed(mbps >= 10 ? 0 : 1)} Mbps`;

interface ClientProtocolWidgetProps {
  stations: Station[];
}

function ClientProtocolWidgetImpl({ stations }: ClientProtocolWidgetProps) {
  const buckets = useMemo(() => aggregateProtocols(stations), [stations]);
  const total = stations.length;
  const maxThroughput = useMemo(
    () => Math.max(1, ...buckets.map((b) => b.throughputMbps)),
    [buckets]
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Radio className="h-5 w-5 text-primary" />
              Client Protocols
            </CardTitle>
            <CardDescription>Connected clients by Wi-Fi protocol generation</CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums">{total}</div>
            <div className="text-xs text-muted-foreground">clients</div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {total === 0 || buckets.length === 0 ? (
          <div className="text-center text-muted-foreground py-10">
            <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No clients connected</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Client count donut + legend */}
              <div className="flex items-center gap-4">
                <div className="h-36 w-36 flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={buckets}
                        dataKey="count"
                        nameKey="gen"
                        cx="50%"
                        cy="50%"
                        innerRadius={38}
                        outerRadius={64}
                        paddingAngle={2}
                        isAnimationActive={false}
                      >
                        {buckets.map((b) => (
                          <Cell key={b.key} fill={b.color} stroke="var(--background)" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--background)',
                          border: '1px solid var(--border)',
                          borderRadius: '6px',
                          color: 'var(--foreground)',
                        }}
                        formatter={(value, _name, item) => {
                          const b = item?.payload as ProtocolBucket | undefined;
                          return [`${value} clients (${b?.countPct ?? 0}%)`, b?.gen ?? ''];
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="flex-1 space-y-1.5" aria-label="Protocol legend">
                  {buckets.map((b) => (
                    <li key={b.key} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-3 w-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: b.color }}
                        />
                        <span className="truncate">{b.gen}</span>
                        <span className="text-xs text-muted-foreground font-mono">{b.code}</span>
                      </span>
                      <span className="font-medium tabular-nums">
                        {b.count}
                        <span className="text-muted-foreground text-xs ml-1">({b.countPct}%)</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Throughput share by protocol */}
              <div>
                <h4 className="text-sm font-medium mb-3">Throughput by protocol</h4>
                <div className="space-y-2.5">
                  {buckets.map((b) => (
                    <div key={b.key}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="flex items-center gap-1.5">
                          <span className="font-mono text-muted-foreground">{b.code}</span>
                          <span className="truncate">{b.gen}</span>
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {fmtMbps(b.throughputMbps)} ({b.throughputPct}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(2, (b.throughputMbps / maxThroughput) * 100)}%`,
                            backgroundColor: b.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Detail table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Protocol</th>
                    <th className="py-2 px-3 font-medium text-right">Clients</th>
                    <th className="py-2 px-3 font-medium text-right">Throughput</th>
                    <th className="py-2 px-3 font-medium text-right">Avg Signal</th>
                    <th className="py-2 pl-3 font-medium text-right">Top band</th>
                  </tr>
                </thead>
                <tbody>
                  {buckets.map((b) => (
                    <tr key={b.key} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-3">
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: b.color }}
                          />
                          <span>{b.gen}</span>
                          <span className="text-xs text-muted-foreground font-mono">{b.code}</span>
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {b.count}
                        <span className="text-muted-foreground text-xs ml-1">({b.countPct}%)</span>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">{fmtMbps(b.throughputMbps)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {b.avgSignal !== null ? `${b.avgSignal} dBm` : '—'}
                      </td>
                      <td className="py-2 pl-3 text-right tabular-nums">{b.topBand}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const ClientProtocolWidget = memo(ClientProtocolWidgetImpl);
