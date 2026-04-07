/**
 * SLE Score Gauge - Large circular percentage display with color-coded arc
 * Designed to render on full-color gradient backgrounds (white text)
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
    <div className="relative inline-flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle - semi-transparent on colored bg */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={3}
        />
        {/* Progress arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={colors.hex}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-700 ease-out"
          filter="drop-shadow(0 0 4px rgba(0,0,0,0.3))"
        />
      </svg>
      <span className="absolute text-base font-bold text-white drop-shadow-sm">
        {value.toFixed(1)}%
      </span>
    </div>
  );
}
