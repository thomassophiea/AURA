import { Radio } from 'lucide-react';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { SparklineBucket } from '../lib/roamingSparklineData';

interface RoamingSparklineProps {
  data: SparklineBucket[];
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: SparklineBucket }>;
}

function SparklineTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const bucket = payload[0]?.payload as SparklineBucket | undefined;
  if (!bucket) return null;
  return (
    <div
      style={{
        backgroundColor: 'rgba(0,0,0,0.85)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: '6px',
        padding: '8px 10px',
        fontSize: '11px',
        color: '#fff',
        backdropFilter: 'blur(8px)',
        lineHeight: '1.6',
      }}
    >
      <div style={{ fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
        {bucket.label}
      </div>
      <div>
        Events: <strong>{bucket.total}</strong>{' '}
        <span style={{ color: 'rgba(255,255,255,0.5)' }}>
          ({bucket.good} good, {bucket.failed} failed)
        </span>
      </div>
      <div>
        Avg rate:{' '}
        <strong>
          {bucket.avgDataRate != null ? `${bucket.avgDataRate.toFixed(0)} Mbps` : '—'}
        </strong>
      </div>
    </div>
  );
}

export function RoamingSparkline({ data }: RoamingSparklineProps) {
  const hasEvents = data.some((b) => b.total > 0);

  if (!hasEvents) {
    return (
      <div
        role="img"
        aria-label="Roaming activity sparkline — no data"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '160px',
          gap: '8px',
        }}
      >
        <Radio style={{ width: 32, height: 32, opacity: 0.3 }} />
        <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', margin: 0 }}>
          No roaming activity in selected time range
        </p>
      </div>
    );
  }

  // Compute right-axis domain so dataRate line doesn't dwarf the bars
  const maxRate = Math.max(...data.map((b) => b.avgDataRate ?? 0));

  return (
    <div
      role="region"
      aria-label="Roaming activity sparkline showing event density and average data rate over time"
      style={{ width: '100%', padding: '16px 24px' }}
    >
      {/* Legend */}
      <div
        style={{
          display: 'flex',
          gap: '16px',
          marginBottom: '8px',
          fontSize: '11px',
          color: 'var(--muted-foreground)',
          alignItems: 'center',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: 2,
              background: 'rgba(34,197,94,0.75)',
            }}
          />
          Good events
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: 2,
              background: 'rgba(239,68,68,0.75)',
            }}
          />
          Failed events
        </span>
        {maxRate > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                display: 'inline-block',
                width: 16,
                height: 2,
                background: 'rgba(99,102,241,0.8)',
              }}
            />
            Avg PHY rate
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <ComposedChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <XAxis dataKey="timeMs" hide />
          <YAxis yAxisId="left" hide />
          <YAxis
            yAxisId="right"
            orientation="right"
            hide
            domain={[0, maxRate > 0 ? maxRate * 1.2 : 1]}
          />
          <Tooltip content={<SparklineTooltip />} />
          <Bar
            yAxisId="left"
            dataKey="good"
            stackId="events"
            fill="rgba(34,197,94,0.75)"
            isAnimationActive={false}
          />
          <Bar
            yAxisId="left"
            dataKey="failed"
            stackId="events"
            fill="rgba(239,68,68,0.75)"
            isAnimationActive={false}
          />
          {maxRate > 0 && (
            <Line
              yAxisId="right"
              dataKey="avgDataRate"
              type="monotone"
              stroke="rgba(99,102,241,0.85)"
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
