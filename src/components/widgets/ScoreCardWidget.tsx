import React from 'react';
import { TrendingUp, TrendingDown, Activity, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { formatCompactNumber } from '../../lib/units';

interface ScoreCardProps {
  title: string;
  value: number | string;
  unit?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    direction: 'up' | 'down';
  };
  status?: 'good' | 'warning' | 'critical' | 'neutral';
  subtitle?: string;
  onClick?: () => void;
}

export const ScoreCardWidget: React.FC<ScoreCardProps> = ({
  title,
  value,
  unit,
  icon,
  trend,
  status = 'neutral',
  subtitle,
  onClick
}) => {
  const statusColors = {
    good: 'bg-green-500/10 border-green-500/20',
    warning: 'bg-amber-500/10 border-amber-500/20',
    critical: 'bg-red-500/10 border-red-500/20',
    neutral: 'bg-card border-border'
  };

  const statusIconColors = {
    good: 'text-green-500',
    warning: 'text-amber-500',
    critical: 'text-red-500',
    neutral: 'text-blue-500'
  };

  const StatusIcon = status === 'good' ? CheckCircle :
                     status === 'critical' ? XCircle :
                     status === 'warning' ? AlertCircle :
                     Activity;

  const formattedValue = typeof value === 'number' ? formatValue(value, unit) : value;

  return (
    <div
      className={`${statusColors[status]} rounded-lg p-6 ${onClick ? 'cursor-pointer hover:shadow-lg transition-shadow' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-4">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        {icon || <StatusIcon className={`w-5 h-5 ${statusIconColors[status]}`} />}
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-foreground">
            {formattedValue}
          </span>
          {unit && typeof value === 'string' && (
            <span className="text-sm text-muted-foreground">{unit}</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {trend && (
            <div className={`flex items-center gap-1 text-sm ${
              trend.direction === 'up' ? 'text-green-500' : 'text-red-500'
            }`}>
              {trend.direction === 'up' ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              <span>{Math.abs(trend.value).toFixed(1)}%</span>
            </div>
          )}

          {subtitle && (
            <span className="text-sm text-muted-foreground">{subtitle}</span>
          )}
        </div>
      </div>
    </div>
  );
};

interface ScoreCardGridProps {
  cards: ScoreCardProps[];
  columns?: 1 | 2 | 3 | 4;
}

export const ScoreCardGrid: React.FC<ScoreCardGridProps> = ({
  cards,
  columns = 4
}) => {
  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
  };

  return (
    <div className={`grid ${gridCols[columns]} gap-4`}>
      {cards.map((card, index) => (
        <ScoreCardWidget key={index} {...card} />
      ))}
    </div>
  );
};

/**
 * Format values with appropriate units
 */
function formatValue(value: number, unit?: string): string {
  // Handle missing, empty, or invalid units
  const validUnit = unit && unit !== 'undefined' && unit !== 'null' ? unit : undefined;

  if (!validUnit) {
    // Auto-format large numbers with appropriate unit
    if (value >= 1e12) return `${(value / 1e12).toFixed(2)} TB`;
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)} GB`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)} MB`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(2)} KB`;
    return value.toFixed(2);
  }

  if (validUnit === 'bps') {
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)} Gbps`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)} Mbps`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(2)} Kbps`;
    return `${value.toFixed(0)} bps`;
  }

  if (validUnit === 'bytes') {
    if (value >= 1e12) return `${(value / 1e12).toFixed(2)} TB`;
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)} GB`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)} MB`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(2)} KB`;
    return `${value.toFixed(0)} B`;
  }

  if (validUnit === 'users' || validUnit === 'count' || validUnit === 'clients' || validUnit === 'packets') {
    return formatCompactNumber(value);
  }

  if (validUnit === '%' || validUnit === 'percent') {
    return `${value.toFixed(1)}%`;
  }

  if (validUnit === 'ms' || validUnit === 'milliseconds') {
    if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
    return `${value.toFixed(0)} ms`;
  }

  // Default: append unit
  return `${value.toFixed(2)} ${validUnit}`;
}
