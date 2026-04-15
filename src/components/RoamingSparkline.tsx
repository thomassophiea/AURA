import { Radio } from 'lucide-react';
import {
  ComposedChart,
  Bar,
  Area,
  Line,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
  ResponsiveContainer,
} from 'recharts';
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

function formatThroughput(bps: number): string {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} Kbps`;
  return `${bps.toFixed(0)} bps`;
}

function formatXTick(timeMs: number): string {
  const d = new Date(timeMs);
  const now = Date.now();
  const ageMs = now - timeMs;
  if (ageMs < 2 * 3_600_000) {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
  if (ageMs < 7 * 24 * 3_600_000) {
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Pick a fill color for a bar based on its dominant band. */
function bandFill(bandCounts: SparklineBucket['bandCounts'], opacity = 0.7): string {
  const { '5GHz': g5, '6GHz': g6, '2.4GHz': g24 } = bandCounts;
  const max = Math.max(g5, g6, g24);
  if (max === 0) return `rgba(34,197,94,${opacity})`;
  if (g6 === max) return `rgba(129,140,248,${opacity})`; // 6GHz → indigo
  if (g5 === max) return `rgba(34,197,94,${opacity})`; // 5GHz → green
  if (g24 === max) return `rgba(251,191,36,${opacity})`; // 2.4GHz → amber
  return `rgba(34,197,94,${opacity})`;
}

/** Whether a bucket has band diversity data (events with known frequency). */
function hasBandData(data: SparklineBucket[]): boolean {
  return data.some(
    (b) => b.bandCounts['5GHz'] > 0 || b.bandCounts['6GHz'] > 0 || b.bandCounts['2.4GHz'] > 0
  );
}

/** 0-100 connectivity health score derived from bucket data. */
function computeConnectivityScore(data: SparklineBucket[]): number {
  const active = data.filter((b) => b.total > 0);
  if (active.length === 0) return 0;

  const total = active.reduce((s, b) => s + b.total, 0);
  const failed = active.reduce((s, b) => s + b.failed, 0);
  const lateRoams = active.reduce((s, b) => s + b.lateRoamCount, 0);
  const rssiValues = active.flatMap((b) => (b.avgRssi != null ? [b.avgRssi] : []));

  const successRate = total > 0 ? (total - failed) / total : 1;
  const rssiAvg =
    rssiValues.length > 0 ? rssiValues.reduce((s, v) => s + v, 0) / rssiValues.length : -65;
  const rssiScore = Math.max(0, Math.min(1, (rssiAvg - -90) / 60));
  const lateRoamPenalty = Math.min(0.2, lateRoams * 0.04);

  return Math.round(
    Math.max(0, successRate * 0.55 + rssiScore * 0.35 + 0.1 - lateRoamPenalty) * 100
  );
}

function scoreColor(score: number): string {
  if (score >= 80) return 'rgba(74,222,128,0.9)';
  if (score >= 60) return 'rgba(251,191,36,0.9)';
  if (score >= 40) return 'rgba(249,115,22,0.9)';
  return 'rgba(239,68,68,0.9)';
}

function scoreLabel(score: number): string {
  if (score >= 80) return 'Good';
  if (score >= 60) return 'Fair';
  if (score >= 40) return 'Poor';
  return 'Critical';
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
        backgroundColor: 'rgba(10,10,18,0.95)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '8px',
        padding: '10px 13px',
        fontSize: '11px',
        color: '#fff',
        backdropFilter: 'blur(12px)',
        lineHeight: '1.8',
        minWidth: 190,
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      }}
    >
      <div
        style={{
          fontWeight: 700,
          color: 'rgba(255,255,255,0.55)',
          marginBottom: 6,
          fontSize: 10,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        {bucket.label}
      </div>
      <div>
        Events: <strong style={{ color: '#fff' }}>{bucket.total}</strong>{' '}
        <span style={{ color: 'rgba(255,255,255,0.4)' }}>
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
          PHY rate:{' '}
          <strong style={{ color: 'rgba(99,102,241,0.95)' }}>
            {bucket.avgDataRate.toFixed(0)} Mbps
          </strong>
        </div>
      )}
      {bucket.throughputBps != null && (
        <div>
          Throughput:{' '}
          <strong style={{ color: 'rgba(20,184,166,0.95)' }}>
            {formatThroughput(bucket.throughputBps)}
          </strong>
        </div>
      )}
      {bucket.tcpRttMs != null && (
        <div>
          TCP RTT:{' '}
          <strong style={{ color: 'rgba(56,189,248,0.95)' }}>
            {bucket.tcpRttMs.toFixed(0)} ms
          </strong>
        </div>
      )}
      {dominantBand && dominantBand[1] > 0 && (
        <div style={{ color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
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
          height: '220px',
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

  // Normalize all line/area metrics to [0, 100] so they share the right Y-axis
  const maxRate = Math.max(...data.map((b) => b.avgDataRate ?? 0));
  const maxDwell = Math.max(...data.map((b) => b.avgDwell ?? 0));
  const maxThroughput = Math.max(...data.map((b) => b.throughputBps ?? 0));
  const maxRtt = Math.max(...data.map((b) => b.tcpRttMs ?? 0));
  const maxTotal = Math.max(...data.map((b) => b.total));
  const hasRssi = data.some((b) => b.avgRssi != null);
  const hasDwell = data.some((b) => b.avgDwell != null);
  const hasRate = maxRate > 0;
  const hasThroughput = maxThroughput > 0;
  const hasRtt = maxRtt > 0;
  const hasBands = hasBandData(data);

  const chartData = data.map((b) => ({
    ...b,
    normRssi: b.avgRssi != null ? normalizeRssi(b.avgRssi) : null,
    normDwell: b.avgDwell != null && maxDwell > 0 ? (b.avgDwell / maxDwell) * 100 : null,
    normRate: b.avgDataRate != null && maxRate > 0 ? (b.avgDataRate / maxRate) * 100 : null,
    normThroughput:
      b.throughputBps != null && maxThroughput > 0 ? (b.throughputBps / maxThroughput) * 100 : null,
    normRtt: b.tcpRttMs != null && maxRtt > 0 ? (b.tcpRttMs / maxRtt) * 100 : null,
    normIntensity: maxTotal > 0 ? (b.total / maxTotal) * 85 : null,
    goodFill: bandFill(b.bandCounts, 0.72),
  }));

  const score = computeConnectivityScore(data);
  const color = scoreColor(score);

  const total = data.reduce((s, b) => s + b.total, 0);
  const failed = data.reduce((s, b) => s + b.failed, 0);
  const successPct = total > 0 ? Math.round(((total - failed) / total) * 100) : 100;
  const rssiValues = data.flatMap((b) => (b.avgRssi != null ? [b.avgRssi] : []));
  const avgRssi =
    rssiValues.length > 0 ? rssiValues.reduce((s, v) => s + v, 0) / rssiValues.length : null;
  const tptValues = data.flatMap((b) => (b.throughputBps != null ? [b.throughputBps] : []));
  const avgThroughputBps =
    tptValues.length > 0 ? tptValues.reduce((s, v) => s + v, 0) / tptValues.length : null;

  const legendItems = [
    ...(hasBands
      ? [
          { color: 'rgba(34,197,94,0.8)', shape: 'square', label: '5GHz' },
          { color: 'rgba(129,140,248,0.8)', shape: 'square', label: '6GHz' },
          { color: 'rgba(251,191,36,0.8)', shape: 'square', label: '2.4GHz' },
        ]
      : [{ color: 'rgba(34,197,94,0.8)', shape: 'square', label: 'Good' }]),
    { color: 'rgba(239,68,68,0.8)', shape: 'square', label: 'Failed' },
    ...(hasRssi ? [{ color: 'rgba(251,191,36,0.9)', shape: 'area', label: 'RSSI' }] : []),
    ...(hasDwell ? [{ color: 'rgba(168,85,247,0.9)', shape: 'area', label: 'Dwell' }] : []),
    ...(hasRate ? [{ color: 'rgba(99,102,241,0.9)', shape: 'area', label: 'PHY rate' }] : []),
    ...(hasThroughput
      ? [{ color: 'rgba(20,184,166,0.9)', shape: 'area', label: 'Throughput' }]
      : []),
    ...(hasRtt ? [{ color: 'rgba(56,189,248,0.9)', shape: 'dashed', label: 'TCP RTT' }] : []),
  ];

  return (
    <div
      role="region"
      aria-label="Roaming activity sparkline showing event density, signal quality, dwell time, and data rate over time"
      style={{ width: '100%', padding: '16px 24px 12px' }}
    >
      {/* Header: legend left, connectivity score right */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '14px',
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
              ) : item.shape === 'dashed' ? (
                <span
                  style={{
                    display: 'inline-block',
                    width: 18,
                    height: 0,
                    borderTop: `2px dashed ${item.color}`,
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

        {/* Connectivity score pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '4px 12px',
            borderRadius: '999px',
            border: `1px solid ${color}`,
            background: color.replace('0.9)', '0.1)'),
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700, color, lineHeight: 1 }}>{score}</span>
          <span
            style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.5)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            {scoreLabel(score)}
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 20 }}>
          <defs>
            <linearGradient id="gradRssi" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="rgba(251,191,36,1)" stopOpacity={0.25} />
              <stop offset="95%" stopColor="rgba(251,191,36,1)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradDwell" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="rgba(168,85,247,1)" stopOpacity={0.22} />
              <stop offset="95%" stopColor="rgba(168,85,247,1)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradRate" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="rgba(99,102,241,1)" stopOpacity={0.2} />
              <stop offset="95%" stopColor="rgba(99,102,241,1)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradThroughput" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="rgba(20,184,166,1)" stopOpacity={0.25} />
              <stop offset="95%" stopColor="rgba(20,184,166,1)" stopOpacity={0} />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="timeMs"
            tickFormatter={formatXTick}
            tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            tickCount={5}
          />
          {/* Left: event count */}
          <YAxis yAxisId="left" hide />
          {/* Right: normalized 0–100 for all overlay metrics */}
          <YAxis yAxisId="right" orientation="right" hide domain={[0, 115]} />

          <Tooltip content={<SparklineTooltip />} />

          {/* Subtle quality-zone tint behind the chart */}
          {hasRssi && (
            <>
              <ReferenceArea
                yAxisId="right"
                y1={0}
                y2={33}
                fill="rgba(239,68,68,0.04)"
                ifOverflow="hidden"
              />
              <ReferenceArea
                yAxisId="right"
                y1={33}
                y2={66}
                fill="rgba(251,191,36,0.03)"
                ifOverflow="hidden"
              />
            </>
          )}

          {/* Stacked bars: good (band-colored or green) + failed (red) */}
          <Bar
            yAxisId="left"
            dataKey="good"
            stackId="events"
            fill="rgba(34,197,94,0.6)"
            isAnimationActive={false}
          >
            {hasBands &&
              chartData.map((entry, index) => (
                <Cell key={`cell-good-${index}`} fill={entry.goodFill} />
              ))}
          </Bar>
          <Bar
            yAxisId="left"
            dataKey="failed"
            stackId="events"
            fill="rgba(239,68,68,0.7)"
            isAnimationActive={false}
          />

          {/* RSSI area — amber with gradient fill */}
          {hasRssi && (
            <Area
              yAxisId="right"
              dataKey="normRssi"
              type="monotone"
              stroke="rgba(251,191,36,0.9)"
              fill="url(#gradRssi)"
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}

          {/* Dwell time area — purple with gradient fill */}
          {hasDwell && (
            <Area
              yAxisId="right"
              dataKey="normDwell"
              type="monotone"
              stroke="rgba(168,85,247,0.9)"
              fill="url(#gradDwell)"
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}

          {/* PHY data rate area — indigo with gradient fill */}
          {hasRate && (
            <Area
              yAxisId="right"
              dataKey="normRate"
              type="monotone"
              stroke="rgba(99,102,241,0.85)"
              fill="url(#gradRate)"
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}

          {/* Throughput area — teal, from station report API */}
          {hasThroughput && (
            <Area
              yAxisId="right"
              dataKey="normThroughput"
              type="monotone"
              stroke="rgba(20,184,166,0.9)"
              fill="url(#gradThroughput)"
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}

          {/* TCP RTT line — sky blue, dashed, from station report API */}
          {hasRtt && (
            <Line
              yAxisId="right"
              dataKey="normRtt"
              type="monotone"
              stroke="rgba(56,189,248,0.85)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Stats strip */}
      <div
        style={{
          display: 'flex',
          gap: '20px',
          marginTop: 4,
          fontSize: '11px',
          color: 'rgba(255,255,255,0.4)',
          flexWrap: 'wrap',
        }}
      >
        <span>
          <strong style={{ color: 'rgba(255,255,255,0.8)' }}>{total}</strong> events
        </span>
        <span>
          Success{' '}
          <strong
            style={{
              color:
                successPct >= 90
                  ? 'rgba(74,222,128,0.9)'
                  : successPct >= 70
                    ? 'rgba(251,191,36,0.9)'
                    : 'rgba(239,68,68,0.9)',
            }}
          >
            {successPct}%
          </strong>
        </span>
        {avgRssi != null && (
          <span>
            Avg RSSI{' '}
            <strong style={{ color: 'rgba(251,191,36,0.9)' }}>{avgRssi.toFixed(0)} dBm</strong>
          </span>
        )}
        {avgThroughputBps != null && (
          <span>
            Avg throughput{' '}
            <strong style={{ color: 'rgba(20,184,166,0.9)' }}>
              {formatThroughput(avgThroughputBps)}
            </strong>
          </span>
        )}
      </div>

      {/* Late roam callout */}
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
