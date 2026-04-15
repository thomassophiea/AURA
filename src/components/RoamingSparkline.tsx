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

// Normalize RSSI (-90 worst → 0, -30 best → 100)
function normalizeRssi(rssi: number): number {
  return Math.max(0, Math.min(100, ((rssi - -90) / 60) * 100));
}

function formatDwell(ms: number): string {
  if (ms < 1_000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1_000)}s`;
  return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

function SparklineTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const bucket = payload[0]?.payload as SparklineBucket | undefined;
  if (!bucket) return null;

  const dominantBand = Object.entries(bucket.bandCounts)
    .filter(([k]) => k !== 'other')
    .sort(([, a], [, b]) => b - a)[0];

  return (
    <div
      style={{
        backgroundColor: 'rgba(0,0,0,0.88)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: '6px',
        padding: '8px 11px',
        fontSize: '11px',
        color: '#fff',
        backdropFilter: 'blur(8px)',
        lineHeight: '1.7',
        minWidth: 180,
      }}
    >
      <div style={{ fontWeight: 600, color: 'rgba(255,255,255,0.65)', marginBottom: 5 }}>
        {bucket.label}
      </div>
      <div>
        Events: <strong style={{ color: '#fff' }}>{bucket.total}</strong>{' '}
        <span style={{ color: 'rgba(255,255,255,0.45)' }}>
          ({bucket.good} good
          {bucket.failed > 0 && (
            <span style={{ color: 'rgba(239,68,68,0.9)' }}>, {bucket.failed} failed</span>
          )}
          )
        </span>
      </div>
      {bucket.avgRssi != null && (
        <div>
          Avg RSSI:{' '}
          <strong style={{ color: 'rgba(251,191,36,0.95)' }}>
            {bucket.avgRssi.toFixed(0)} dBm
          </strong>
        </div>
      )}
      {bucket.avgDwell != null && (
        <div>
          Avg dwell:{' '}
          <strong style={{ color: 'rgba(168,85,247,0.95)' }}>{formatDwell(bucket.avgDwell)}</strong>
        </div>
      )}
      {bucket.avgDataRate != null && (
        <div>
          Avg rate:{' '}
          <strong style={{ color: 'rgba(99,102,241,0.95)' }}>
            {bucket.avgDataRate.toFixed(0)} Mbps
          </strong>
        </div>
      )}
      {dominantBand && dominantBand[1] > 0 && (
        <div style={{ color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
          Band: {dominantBand[0]} ({dominantBand[1]})
          {bucket.bandCounts['2.4GHz'] > 0 && bucket.bandCounts['5GHz'] > 0 && (
            <span> · mixed</span>
          )}
        </div>
      )}
      {bucket.lateRoamCount > 0 && (
        <div style={{ color: 'rgba(239,68,68,0.85)', marginTop: 2 }}>
          ⚠ {bucket.lateRoamCount} late roam{bucket.lateRoamCount > 1 ? 's' : ''}
        </div>
      )}
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
          height: '200px',
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

  // Normalize all line metrics to [0, 100] so they share the right Y-axis
  const maxRate = Math.max(...data.map((b) => b.avgDataRate ?? 0));
  const maxDwell = Math.max(...data.map((b) => b.avgDwell ?? 0));
  const hasRssi = data.some((b) => b.avgRssi != null);
  const hasDwell = data.some((b) => b.avgDwell != null);
  const hasRate = maxRate > 0;

  const chartData = data.map((b) => ({
    ...b,
    normRssi: b.avgRssi != null ? normalizeRssi(b.avgRssi) : null,
    normDwell: b.avgDwell != null && maxDwell > 0 ? (b.avgDwell / maxDwell) * 100 : null,
    normRate: b.avgDataRate != null && maxRate > 0 ? (b.avgDataRate / maxRate) * 100 : null,
  }));

  const legendItems = [
    { color: 'rgba(34,197,94,0.75)', shape: 'square', label: 'Good events' },
    { color: 'rgba(239,68,68,0.75)', shape: 'square', label: 'Failed events' },
    ...(hasRssi ? [{ color: 'rgba(251,191,36,0.9)', shape: 'line', label: 'Avg RSSI' }] : []),
    ...(hasDwell ? [{ color: 'rgba(168,85,247,0.9)', shape: 'line', label: 'Avg dwell' }] : []),
    ...(hasRate ? [{ color: 'rgba(99,102,241,0.9)', shape: 'line', label: 'Avg PHY rate' }] : []),
  ];

  return (
    <div
      role="region"
      aria-label="Roaming activity sparkline showing event density, signal quality, dwell time, and data rate over time"
      style={{ width: '100%', padding: '16px 24px' }}
    >
      {/* Legend */}
      <div
        style={{
          display: 'flex',
          gap: '16px',
          marginBottom: '10px',
          fontSize: '11px',
          color: 'var(--muted-foreground)',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        {legendItems.map((item) => (
          <span key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {item.shape === 'square' ? (
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: item.color,
                }}
              />
            ) : (
              <span
                style={{
                  display: 'inline-block',
                  width: 18,
                  height: 2,
                  background: item.color,
                  borderRadius: 1,
                }}
              />
            )}
            {item.label}
          </span>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <XAxis dataKey="timeMs" hide />
          {/* Left: event count */}
          <YAxis yAxisId="left" hide />
          {/* Right: normalized 0-100 for all line metrics */}
          <YAxis yAxisId="right" orientation="right" hide domain={[0, 110]} />
          <Tooltip content={<SparklineTooltip />} />

          {/* Stacked bars: good + failed */}
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

          {/* RSSI line — amber, normalized */}
          {hasRssi && (
            <Line
              yAxisId="right"
              dataKey="normRssi"
              type="monotone"
              stroke="rgba(251,191,36,0.9)"
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}

          {/* Dwell time line — purple, normalized */}
          {hasDwell && (
            <Line
              yAxisId="right"
              dataKey="normDwell"
              type="monotone"
              stroke="rgba(168,85,247,0.9)"
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}

          {/* Data rate line — indigo, normalized */}
          {hasRate && (
            <Line
              yAxisId="right"
              dataKey="normRate"
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

      {/* Late roam callout beneath chart if any exist */}
      {data.some((b) => b.lateRoamCount > 0) && (
        <div
          style={{
            marginTop: 6,
            fontSize: '11px',
            color: 'rgba(239,68,68,0.8)',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          ⚠ Late roams detected in {data.filter((b) => b.lateRoamCount > 0).length} bucket
          {data.filter((b) => b.lateRoamCount > 0).length > 1 ? 's' : ''} — hover for details
        </div>
      )}
    </div>
  );
}
