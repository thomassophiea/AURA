/**
 * SLE Timeline - Subtle AreaChart on colored gradient backgrounds
 * Uses white/semi-transparent strokes to blend with the card background
 */

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { SLETimeSeriesPoint } from '../../types/sle';

interface SLETimelineProps {
  data: SLETimeSeriesPoint[];
  status: 'good' | 'warn' | 'poor';
  height?: number;
  id?: string;
}

export function SLETimeline({ data, status, height = 80, id = 'default' }: SLETimelineProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-white/40" style={{ height }}>
        <div className="w-2 h-2 rounded-full bg-white/30 animate-pulse" />
      </div>
    );
  }

  const gradientId = `sleTimelineGrad-${id}`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="rgba(255,255,255,0.45)" />
            <stop offset="95%" stopColor="rgba(255,255,255,0.05)" />
          </linearGradient>
        </defs>
        <XAxis dataKey="time" hide />
        <YAxis domain={[0, 100]} hide />
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(0,0,0,0.8)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '6px',
            color: '#fff',
            fontSize: '11px',
            backdropFilter: 'blur(8px)',
          }}
          formatter={(value: number) => [`${value.toFixed(1)}%`, 'Success Rate']}
          labelFormatter={(label: string) => label}
        />
        <Area
          type="monotone"
          dataKey="successRate"
          stroke="rgba(255,255,255,0.8)"
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
