/**
 * SLE Timeline - AreaChart showing success rate over time
 */

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { SLETimeSeriesPoint } from '../../types/sle';
import { SLE_STATUS_COLORS } from '../../types/sle';

interface SLETimelineProps {
  data: SLETimeSeriesPoint[];
  status: 'good' | 'warn' | 'poor';
  height?: number;
}

export function SLETimeline({ data, status, height = 80 }: SLETimelineProps) {
  const colors = SLE_STATUS_COLORS[status];

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-muted-foreground" style={{ height }}>
        Collecting data...
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 4, left: 4, bottom: 2 }}>
        <defs>
          <linearGradient id={`sleGrad-${status}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={colors.hex} stopOpacity={0.3} />
            <stop offset="95%" stopColor={colors.hex} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="time" hide />
        <YAxis domain={[0, 100]} hide />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
            color: 'hsl(var(--foreground))',
            fontSize: '11px',
          }}
          formatter={(value: number) => [`${value.toFixed(1)}%`, 'Success Rate']}
          labelFormatter={(label: string) => label}
        />
        <Area
          type="monotone"
          dataKey="successRate"
          stroke={colors.hex}
          strokeWidth={1.5}
          fill={`url(#sleGrad-${status})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
