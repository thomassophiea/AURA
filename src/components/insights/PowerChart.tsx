/**
 * Power Consumption chart for AP Insights.
 *
 * Extracted from APInsights.tsx while fixing the milliwatt/watt bug so the unit
 * handling lives in one place. Values arrive from the controller in mW; this
 * component renders watts.
 */

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { CHART_COLORS, TIMELINE_COLORS } from '../../config/colorPalette';
import { timelineChartHandlers } from '../../lib/timelineChartEvents';
import type { useTimelineNavigation } from '../../hooks/useTimelineNavigation';

type Timeline = ReturnType<typeof useTimelineNavigation>;

interface PowerChartProps {
  title: string;
  /** Chart rows keyed by timestamp, with `Power Consumption` already in watts. */
  data: Array<Record<string, number | string>>;
  timeline: Timeline;
  formatXAxisTick: (timestamp: number) => string;
  /** Measured watts at the locked timestamp, or null when unlocked. */
  lockedPowerW: number | null;
  tooltipStyle: React.CSSProperties;
}

const POWER_KEY = 'Power Consumption';

export function PowerChart({
  title,
  data,
  timeline,
  formatXAxisTick,
  lockedPowerW,
  tooltipStyle,
}: PowerChartProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {lockedPowerW !== null && (
            <Badge variant="secondary" className="font-mono">
              <span className="text-amber-500 font-semibold mr-1">Power:</span>{' '}
              {lockedPowerW.toFixed(2)} W
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
              syncId="ap-insights-charts"
              {...timelineChartHandlers(timeline)}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="timestamp"
                tick={{ fontSize: 11 }}
                tickFormatter={(ts) => formatXAxisTick(ts)}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => `${v.toFixed(0)} W`}
                width={50}
              />
              <Tooltip
                formatter={(value) => [`${Number(value).toFixed(2)} W`, '']}
                labelFormatter={() => ''}
                contentStyle={tooltipStyle}
              />
              <Legend />
              {/* Locked marker only — recharts' synced tooltip cursor is the
                  live tracking indicator, and a second line chasing it a frame
                  behind reads as jitter. */}
              {timeline.isLocked && timeline.currentTime !== null && (
                <ReferenceLine
                  x={timeline.currentTime}
                  stroke={TIMELINE_COLORS.cursorLocked}
                  strokeWidth={2}
                  strokeDasharray={TIMELINE_COLORS.cursorLockedDasharray}
                />
              )}
              {timeline.timeWindow.start !== null && timeline.timeWindow.end !== null && (
                <ReferenceArea
                  x1={Math.min(timeline.timeWindow.start, timeline.timeWindow.end)}
                  x2={Math.max(timeline.timeWindow.start, timeline.timeWindow.end)}
                  fill="var(--primary)"
                  fillOpacity={0.15}
                  stroke="var(--primary)"
                  strokeOpacity={0.3}
                />
              )}
              <Line
                type="monotone"
                dataKey={POWER_KEY}
                stroke={CHART_COLORS.slate}
                dot={false}
                name="Power"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
