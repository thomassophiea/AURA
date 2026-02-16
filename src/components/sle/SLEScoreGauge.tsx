/**
 * SLE Score Gauge - Large circular percentage display with color-coded arc
 */

import { SLE_STATUS_COLORS } from '../../types/sle';

interface SLEScoreGaugeProps {
  value: number;
  status: 'good' | 'warn' | 'poor';
  size?: number;
}

export function SLEScoreGauge({ value, status, size = 80 }: SLEScoreGaugeProps) {
  const colors = SLE_STATUS_COLORS[status];
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (value / 100) * circumference;
  const center = size / 2;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={4}
        />
        {/* Progress arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={colors.hex}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span className={`absolute text-lg font-bold ${colors.text}`}>
        {value.toFixed(1)}%
      </span>
    </div>
  );
}
