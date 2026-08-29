/**
 * SLE Trend Strip — compact time-series chart for the drill-down panel.
 * Answers the question the honeycomb can't: is this metric getting better or
 * worse across the selected window? Data is the metric's merged series (live
 * calculation + persisted history), so it survives reloads and redeploys.
 */

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { SLE_STATUS_COLORS } from '../../types/sle';
import type { SLEMetric } from '../../types/sle';

interface SLETrendStripProps {
  sle: SLEMetric;
}

/**
 * Change across the series in percentage points, or null when unknowable.
 * Only history-backed series qualify — the local buffer's series are not
 * percentages (Mbps, seconds, severity scores) and would produce nonsense.
 */
export function seriesDelta(sle: SLEMetric): number | null {
  if (!sle.historyBacked) return null;
  const points = sle.timeSeries ?? [];
  if (points.length < 2) return null;
  return points[points.length - 1].successRate - points[0].successRate;
}

interface TrendTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: { time: string; successRate: number; affectedClients: number } }>;
}

function TrendTooltip({ active, payload }: TrendTooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-lg">
      <div className="font-medium">{point.time}</div>
      <div>{point.successRate.toFixed(1)}%</div>
      {point.affectedClients > 0 && (
        <div className="text-muted-foreground">{point.affectedClients} affected</div>
      )}
    </div>
  );
}

export function SLETrendStrip({ sle }: SLETrendStripProps) {
  const points = sle.timeSeries ?? [];
  if (!sle.historyBacked || points.length < 2) return null;

  const color = SLE_STATUS_COLORS[sle.status].hex;
  const min = Math.min(...points.map((p) => p.successRate));
  // A trend pinned at 100% is real information — keep the domain honest but
  // give a flat series a little headroom so the line isn't glued to the frame.
  const domainMin = Math.max(0, Math.floor(min - 5));
  const delta = seriesDelta(sle);

  return (
    <div className="px-2">
      <div className="flex items-center justify-between px-3 pb-1">
        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
          Trend
        </span>
        {delta !== null && Math.abs(delta) >= 0.1 && (
          <span
            className="text-xs font-semibold"
            style={{ color: delta >= 0 ? 'var(--status-success)' : 'var(--status-error)' }}
          >
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)} pts over this window
          </span>
        )}
      </div>
      <div className="h-28 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`trend-${sle.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              minTickGap={48}
            />
            <YAxis
              domain={[domainMin, 100]}
              width={34}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
              tickFormatter={(v: number) => `${v}%`}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<TrendTooltip />} />
            <ReferenceLine y={100} stroke="var(--border)" strokeDasharray="2 4" />
            <Area
              type="monotone"
              dataKey="successRate"
              stroke={color}
              strokeWidth={2}
              fill={`url(#trend-${sle.id})`}
              isAnimationActive={false}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
